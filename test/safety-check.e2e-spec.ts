import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus, EventStatus, NotificationType, PrismaClient, ReservationStatus } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * Requirement change 6 e2e — the operational safety check, end to end through
 * the real wiring: the Coordinator confirms the arrangements once they are
 * ready (US-42), which puts the event in the queue; the Safety Officer
 * decides, and CONFIRMED is reachable no other way.
 *
 * Code under test: SafetyService (listQueue, getPacket, decide, resubmit,
 * getHistory), EventConfirmationService.confirm (US-42, the only way into
 * AWAITING_SAFETY_CHECK), SafetyReadinessService and the Safety Officer
 * notifications (US-64).
 *
 * Pre-condition for every test: reset the testDB, then run base-users.sql and
 * tc-s3-177-setup.sql (Sam and Mei, the only Safety Officers; Main Hall;
 * microphones; the "Careers Fair" EVT-300 in planning). Events reach the queue
 * through the real confirm endpoint, as in use.
 */
describe('Safety check (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  /** Fixed rows from base-users and tc-s3-177-setup. */
  const ids: Record<string, string> = {
    organiser: 'USR-006',
    coordinator: 'USR-004',
    otherCoordinator: 'USR-005',
    officer: 'USR-033',
    officer2: 'USR-034',
    venueStaff: 'USR-010',
    techSupport: 'USR-009',
    attendee: 'USR-001',
    mic: 'EQP-022',
  };
  const LOGINS: Record<string, string> = {
    organiser: 'organiser@example.com',
    coordinator: 'coord.a@example.com',
    otherCoordinator: 'coord.b@example.com',
    officer: 'sam.officer@example.com',
    officer2: 'mei.officer@example.com',
    venueStaff: 'venue.staff@example.com',
    techSupport: 'tech.support@example.com',
    attendee: 'attendee@example.com',
  };

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  /** EVT-300 (tc-s3-177-setup): 1 Oct 2030 09:00-13:00 UTC. */
  const start = new Date('2030-10-01T09:00:00Z');
  const careersFair = { id: 'EVT-300' };

  const statusOf = async (eventId: string) =>
    (await prisma.eventRequest.findUniqueOrThrow({ where: { id: eventId } })).status;

  const approveBooking = (bookingId: string) =>
    http().post(`/bookings/${bookingId}/approve`).set('Authorization', as('venueStaff')).send({});

  const reserve = (eventId: string, equipmentId: string, quantity: number) =>
    http()
      .post('/equipment/reservations')
      .set('Authorization', as('techSupport'))
      .send({ eventId, equipmentId, quantity });

  /** US-42 — the assigned Coordinator confirms the arrangements. */
  const confirmArrangements = (eventId: string, who = 'coordinator') =>
    http().post(`/events/${eventId}/confirm`).set('Authorization', as(who));

  const queue = (who = 'officer') =>
    http().get('/safety/queue').set('Authorization', as(who));
  const packet = (eventId: string, who = 'officer') =>
    http().get(`/safety/events/${eventId}`).set('Authorization', as(who));
  const decide = (eventId: string, body: Record<string, unknown>, who = 'officer') =>
    http()
      .post(`/safety/events/${eventId}/decision`)
      .set('Authorization', as(who))
      .send(body);
  const reviews = (eventId: string, who: string) =>
    http().get(`/safety/events/${eventId}/reviews`).set('Authorization', as(who));

  /** An event with an approved booking (tc-s3-177e by default), confirmed into the Safety queue. */
  const queuedEvent = async (script = 'tc-s3-177e-setup', event = careersFair, booking = { id: 'BKG-163' }) => {
    await given(script);
    await confirmArrangements(event.id).expect(200);
    expect(await statusOf(event.id)).toBe(EventStatus.AWAITING_SAFETY_CHECK);
    return { event, booking };
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    prisma = new PrismaClient();

    // Users keep their fixed IDs after every reset, so these tokens stay valid.
    await resetDb(prisma);
    await given('base-users', 'tc-s3-177-setup');
    for (const [key, email] of Object.entries(LOGINS)) {
      const res = await http().post('/auth/login').send({ email, password: PASSWORD }).expect(200);
      tokens[key] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await given('base-users', 'tc-s3-177-setup');
  });

  describe('AC-1: an event enters the queue once its arrangements are confirmed', () => {
    // TC-S3-177 · US-57 AC-1 · setup: base-users + tc-s3-177-setup + tc-s3-177b-setup · fails if an event enters the queue before every booking is approved and every requested item reserved, or enters by itself, or the order is wrong
    // Code: EventConfirmationService.confirm; SafetyReadinessService; SafetyService.listQueue
    it('enters the queue when the Coordinator confirms the ready arrangements (US-42), not on its own', async () => {
      await given('tc-s3-177b-setup');
      const [event, booking] = [careersFair, { id: 'BKG-161' }];

      await approveBooking(booking.id).expect(200);

      // Ready, but nothing moves until the Coordinator confirms.
      expect(await statusOf(event.id)).toBe(EventStatus.PLANNING);
      expect((await queue().expect(200)).body).toEqual([]);

      await confirmArrangements(event.id).expect(200);

      expect(await statusOf(event.id)).toBe(EventStatus.AWAITING_SAFETY_CHECK);
      const res = await queue().expect(200);
      expect(res.body.map((e: { id: string }) => e.id)).toEqual([event.id]);
    });

    // TC-S3-177 · US-57 AC-1 · setup: base-users + tc-s3-177-setup + tc-s3-177b-setup + tc-s3-177c-setup · fails if an event enters the queue before every booking is approved and every requested item reserved, or enters by itself, or the order is wrong
    // Code: EventConfirmationService.confirm; SafetyReadinessService; SafetyService.listQueue
    it('waits while any booking is still pending', async () => {
      await given('tc-s3-177b-setup', 'tc-s3-177c-setup');
      const [event, first] = [careersFair, { id: 'BKG-161' }];

      await approveBooking(first.id).expect(200);
      await confirmArrangements(event.id).expect(409);

      expect(await statusOf(event.id)).toBe(EventStatus.PLANNING);
      expect((await queue().expect(200)).body).toEqual([]);
    });

    // TC-S3-177 · US-57 AC-1 · setup: base-users + tc-s3-177-setup + tc-s3-177d-setup + tc-s3-177b-setup · fails if an event enters the queue before every booking is approved and every requested item reserved, or enters by itself, or the order is wrong
    // Code: EventConfirmationService.confirm; SafetyReadinessService; SafetyService.listQueue
    it('waits for requested equipment to be reserved, then can be confirmed', async () => {
      await given('tc-s3-177d-setup', 'tc-s3-177b-setup');
      const [event, booking] = [careersFair, { id: 'BKG-161' }];
      await approveBooking(booking.id).expect(200);
      await confirmArrangements(event.id).expect(409);

      await reserve(event.id, ids.mic, 4).expect(201);
      await confirmArrangements(event.id).expect(200);

      expect(await statusOf(event.id)).toBe(EventStatus.AWAITING_SAFETY_CHECK);
    });

    // TC-S3-177 · US-57 AC-1 · setup: base-users + tc-s3-177-setup + tc-s3-177e-setup + tc-s3-177f-setup · fails if an event enters the queue before every booking is approved and every requested item reserved, or enters by itself, or the order is wrong
    // Code: EventConfirmationService.confirm; SafetyReadinessService; SafetyService.listQueue
    it('lists the longest-waiting event first', async () => {
      const older = await queuedEvent();
      await new Promise((resolve) => setTimeout(resolve, 20));
      const newer = await queuedEvent('tc-s3-177f-setup', { id: 'EVT-301' }, { id: 'BKG-164' });

      const res = await queue().expect(200);

      expect(res.body.map((e: { id: string }) => e.id)).toEqual([older.event.id, newer.event.id]);
    });

    // TC-S3-177 · US-57 AC-1 · setup: base-users + tc-s3-177-setup + tc-s3-177e-setup · fails if an event enters the queue before every booking is approved and every requested item reserved, or enters by itself, or the order is wrong
    // Code: EventConfirmationService.confirm; SafetyReadinessService; SafetyService.listQueue
    it('takes an event back out if an approval is withdrawn before it is checked', async () => {
      const { event, booking } = await queuedEvent();

      await http()
        .post(`/bookings/${booking.id}/reverse`)
        .set('Authorization', as('venueStaff'))
        .send({ reason: 'Double-booked' })
        .expect(200);

      expect(await statusOf(event.id)).toBe(EventStatus.PLANNING);
      expect((await queue().expect(200)).body).toEqual([]);
    });

    // TC-S3-177 · US-57 AC-1 · setup: base-users + tc-s3-177-setup + tc-s3-178-setup + tc-s3-177e-setup + tc-s3-177g-setup · fails if an event stays queued once its requested equipment is no longer reserved
    // Code: SafetyService.listQueue -> SafetyReadinessService.syncAll (EQUIPMENT_NOT_RESERVED)
    it('takes an event back out once its equipment is no longer reserved', async () => {
      await given('tc-s3-178-setup');
      const { event } = await queuedEvent();
      await given('tc-s3-177g-setup');

      expect((await queue().expect(200)).body).toEqual([]);
      expect(await statusOf(event.id)).toBe(EventStatus.PLANNING);
    });
  });

  describe('AC-2: the review shows what the Safety Officer needs', () => {
    // TC-S3-178 · US-57 AC-2 · setup: base-users + tc-s3-177-setup + tc-s3-177e-setup + tc-s3-178-setup + tc-s3-178b-setup · fails if the review misses attendance, capacity, layout, accessibility, equipment or venue restrictions and blocks, or opens an event not awaiting a check
    // Code: SafetyService.getPacket
    it('shows attendance, venue capacity, layout, accessibility, equipment and venue restrictions', async () => {
      const { event } = await queuedEvent();
      await given('tc-s3-178-setup', 'tc-s3-178b-setup');

      const res = await packet(event.id).expect(200);

      expect(res.body.event).toMatchObject({
        expectedAttendance: 150,
        preferredLayout: 'THEATRE',
        accessibilityRequirements: ['STEP_FREE_ACCESS'],
      });
      expect(res.body.venues).toHaveLength(1);
      expect(res.body.venues[0]).toMatchObject({
        capacityMargin: 50,
        venue: {
          name: 'Main Hall',
          capacity: 200,
          operatingInfo: 'No open flames. Maximum two doors in use after 22:00.',
        },
      });
      expect(res.body.venues[0].blocks).toHaveLength(1);
      expect(res.body.venues[0].blocks[0].reason).toBe('Fire alarm testing');
      expect(res.body.equipment.requirements[0]).toMatchObject({ equipmentType: 'Wireless microphone', quantity: 2 });
      expect(res.body.equipment.reservations[0]).toMatchObject({ equipmentType: 'Wireless microphone', quantity: 2 });
    });

    // TC-S3-178 · US-57 AC-2 · setup: base-users + tc-s3-177-setup · fails if the review misses attendance, capacity, layout, accessibility, equipment or venue restrictions and blocks, or opens an event not awaiting a check
    // Code: SafetyService.getPacket
    it('does not open an event that is not awaiting a check', async () => {
      const event = careersFair;

      await packet(event.id).expect(404);
    });
  });

  describe('AC-4/AC-5: approving', () => {
    // TC-S3-179, TC-S3-181 · US-57 AC-3/AC-5 · setup: base-users + tc-s3-177-setup + tc-s3-177e-setup · fails if the factor comments are not kept, or approving does not confirm the event and record the decision, Safety Officer and time
    // Code: SafetyService.decide (APPROVED -> CONFIRMED, SafetyReview)
    it('confirms the event and records the decision, the Safety Officer and the time', async () => {
      const { event } = await queuedEvent();

      const res = await decide(event.id, {
        outcome: 'APPROVED',
        emergencyAccessComment: 'Two clear exits',
        crowdMovementComment: 'Wide aisles',
        equipmentPlacementComment: 'Cables taped down',
        accessibilityComment: 'Ramp at the side door',
      }).expect(200);

      expect(res.body).toMatchObject({
        outcome: 'APPROVED',
        eventStatus: 'CONFIRMED',
        officer: { id: ids.officer, name: 'Sam' },
        emergencyAccessComment: 'Two clear exits',
        crowdMovementComment: 'Wide aisles',
        equipmentPlacementComment: 'Cables taped down',
        accessibilityComment: 'Ramp at the side door',
      });
      expect(Date.parse(res.body.createdAt)).not.toBeNaN();
      expect(await statusOf(event.id)).toBe(EventStatus.CONFIRMED);
      expect((await queue().expect(200)).body).toEqual([]);
    });

    // TC-S3-181 · US-57 AC-5 · setup: base-users + tc-s3-177-setup + tc-s3-177e-setup · fails if the Coordinator is not told of the decision, or is told twice
    // Code: SafetyService.decide -> notifyCoordinator (SAFETY_CHECK_DECIDED)
    it('notifies the Coordinator', async () => {
      const { event } = await queuedEvent();
      await decide(event.id, { outcome: 'APPROVED' }).expect(200);

      // The Safety Officer's notices only (US-42 also told the Organiser when
      // the arrangements were confirmed).
      const notes = await prisma.notification.findMany({
        where: { relatedEventId: event.id, type: NotificationType.SAFETY_CHECK_DECIDED },
      });

      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({
        recipientId: ids.coordinator,
        type: NotificationType.SAFETY_CHECK_DECIDED,
      });
    });
  });

  describe('AC-3/AC-4: reject and request changes need a reason', () => {
    // TC-S3-180 · US-57 AC-4 · setup: base-users + tc-s3-177-setup + tc-s3-177e-setup · fails if reject or request changes is accepted without a reason, or request changes without a stage
    // Code: SafetyDecisionDto; SafetyService.decide
    it.each(['REJECTED', 'CHANGES_REQUESTED'])('%s without a reason is refused and changes nothing', async (outcome) => {
      const { event } = await queuedEvent();

      await decide(event.id, { outcome, returnStage: 'VENUE' }).expect(400);
      await decide(event.id, { outcome, returnStage: 'VENUE', reason: '   ' }).expect(400);

      expect(await statusOf(event.id)).toBe(EventStatus.AWAITING_SAFETY_CHECK);
      expect(await prisma.safetyReview.count()).toBe(0);
    });

    // TC-S3-180 · US-57 AC-4 · setup: base-users + tc-s3-177-setup + tc-s3-177e-setup · fails if reject or request changes is accepted without a reason, or request changes without a stage
    // Code: SafetyDecisionDto; SafetyService.decide
    it('requesting changes also needs the stage to return to', async () => {
      const { event } = await queuedEvent();

      await decide(event.id, { outcome: 'CHANGES_REQUESTED', reason: 'Too crowded' }).expect(400);
      await decide(event.id, { outcome: 'CHANGES_REQUESTED', reason: 'Too crowded', returnStage: 'ANYWHERE' }).expect(400);
    });
  });

  describe('AC-6: request changes — back to the Coordinator', () => {
    // TC-S3-182 · US-57 AC-6 · setup: base-users + tc-s3-177-setup + tc-s3-177e-setup · fails if the event is not returned to the Coordinator in planning, the wrong arrangements are flagged or changed, the Coordinator is not told why, or it is requeued by itself
    // Code: SafetyService.decide (CHANGES_REQUESTED, returnStage, affectedArrangements) -> notifyCoordinator; SafetyReadinessService.isHeld
    it('returns the event to the Coordinator in planning, flags the stage, changes no arrangement, and says why', async () => {
      const { event, booking } = await queuedEvent();

      const res = await decide(event.id, {
        outcome: 'CHANGES_REQUESTED',
        returnStage: 'VENUE',
        reason: 'Only one exit for 150 people',
      }).expect(200);

      expect(res.body).toMatchObject({
        outcome: 'CHANGES_REQUESTED',
        returnStage: 'VENUE',
        eventStatus: 'PLANNING',
        affectedArrangements: ['VENUE_BOOKING'],
        resubmittedAt: null,
      });
      expect(await statusOf(event.id)).toBe(EventStatus.PLANNING);
      // Flagged, not reopened: Venue Staff are not asked to decide again.
      expect((await prisma.venueBooking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
        BookingStatus.APPROVED,
      );
      const note = await prisma.notification.findFirstOrThrow({
        where: { relatedEventId: event.id, type: NotificationType.SAFETY_CHECK_DECIDED },
      });
      expect(note.recipientId).toBe(ids.coordinator);
      expect(note.message).toContain('Only one exit for 150 people');
      expect(note.message).toContain('venue planning');
      expect(note.message).toContain('send it back for a safety check');
    });

    // TC-S3-182 · US-57 AC-6 · setup: base-users + tc-s3-177-setup + tc-s3-177e-setup + tc-s3-178-setup · fails if the event is not returned to the Coordinator in planning, the wrong arrangements are flagged or changed, the Coordinator is not told why, or it is requeued by itself
    // Code: SafetyService.decide (CHANGES_REQUESTED, returnStage, affectedArrangements) -> notifyCoordinator; SafetyReadinessService.isHeld
    it('returning to technical planning flags the equipment and leaves it reserved', async () => {
      await given('tc-s3-177e-setup', 'tc-s3-178-setup');
      const [event, booking, reservation] = [careersFair, { id: 'BKG-163' }, { id: 'RSV-034' }];
      await confirmArrangements(event.id).expect(200);

      const res = await decide(event.id, {
        outcome: 'CHANGES_REQUESTED',
        returnStage: 'TECHNICAL',
        reason: 'Speakers block the aisle',
      }).expect(200);

      expect(res.body.affectedArrangements).toEqual(['EQUIPMENT_RESERVATION']);
      expect((await prisma.equipmentReservation.findUniqueOrThrow({ where: { id: reservation.id } })).status).toBe(
        ReservationStatus.APPROVED,
      );
      expect((await prisma.venueBooking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
        BookingStatus.APPROVED,
      );
    });

    // TC-S3-182 · US-57 AC-6 · setup: base-users + tc-s3-177-setup + tc-s3-177e-setup · fails if the event is not returned to the Coordinator in planning, the wrong arrangements are flagged or changed, the Coordinator is not told why, or it is requeued by itself
    // Code: SafetyService.decide (CHANGES_REQUESTED, returnStage, affectedArrangements) -> notifyCoordinator; SafetyReadinessService.isHeld
    it('is held out of the queue, however complete its arrangements are, until the Coordinator answers', async () => {
      const { event } = await queuedEvent();
      await decide(event.id, { outcome: 'CHANGES_REQUESTED', returnStage: 'VENUE', reason: 'Add an exit' }).expect(200);

      // Reading the queue re-checks readiness; it must not requeue a held event.
      await queue().expect(200);
      expect((await queue().expect(200)).body).toEqual([]);
      expect(await statusOf(event.id)).toBe(EventStatus.PLANNING);
    });
  });

  describe('the Coordinator answers the feedback', () => {
    const resubmit = (eventId: string, who = 'coordinator') =>
      http().post(`/safety/events/${eventId}/resubmit`).set('Authorization', as(who));

    const editPlan = (eventId: string, body: Record<string, unknown>) =>
      http().patch(`/events/${eventId}/planning`).set('Authorization', as('coordinator')).send(body);

    const sentBack = async (outcome: 'CHANGES_REQUESTED' | 'REJECTED' = 'CHANGES_REQUESTED') => {
      const queued = await queuedEvent();
      await decide(
        queued.event.id,
        outcome === 'CHANGES_REQUESTED'
          ? { outcome, returnStage: 'VENUE', reason: 'Add an exit' }
          : { outcome, reason: 'No safe route out' },
      ).expect(200);
      return queued;
    };

    // TC-S3-185 · US-57 AC-9 · setup: base-users + tc-s3-177-setup + tc-s3-177e-setup · fails if the event returns to the queue without a change, twice, by the wrong user, or earlier checks are lost
    // Code: SafetyService.resubmit (hasChangesSince, readiness, resubmissionComment)
    it('refuses to resubmit an event nothing has changed on', async () => {
      const { event } = await sentBack();

      const res = await resubmit(event.id).expect(409);

      expect(res.body.message).toMatch(/nothing has changed/i);
      expect(await statusOf(event.id)).toBe(EventStatus.PLANNING);
    });

    // TC-S3-185 · US-57 AC-9 · setup: base-users + tc-s3-177-setup + tc-s3-177e-setup · fails if the event returns to the queue without a change, twice, by the wrong user, or earlier checks are lost
    // Code: SafetyService.resubmit (hasChangesSince, readiness, resubmissionComment)
    it('sends the event back to the Safety Officer once the plan has changed, as a re-check with the history kept', async () => {
      const { event } = await sentBack();
      await editPlan(event.id, { layoutNotes: 'Second exit added at the rear' }).expect(200);

      const res = await resubmit(event.id).expect(200);

      expect(res.body.eventStatus).toBe('AWAITING_SAFETY_CHECK');
      expect(await statusOf(event.id)).toBe(EventStatus.AWAITING_SAFETY_CHECK);
      const queued = await queue().expect(200);
      expect(queued.body[0]).toMatchObject({ id: event.id, previousReviews: 1, lastOutcome: 'CHANGES_REQUESTED' });

      const opened = await packet(event.id).expect(200);
      expect(opened.body.history).toHaveLength(1);
      expect(opened.body.history[0].resubmittedAt).not.toBeNull();

      await decide(event.id, { outcome: 'APPROVED' }).expect(200);
      const history = await reviews(event.id, 'officer').expect(200);
      expect(history.body.map((r: { outcome: string }) => r.outcome)).toEqual(['CHANGES_REQUESTED', 'APPROVED']);
    });

    // TC-S3-185 · US-57 AC-9 · setup: base-users + tc-s3-177-setup + tc-s3-177e-setup · fails if the event returns to the queue without a change, twice, by the wrong user, or earlier checks are lost
    // Code: SafetyService.resubmit (hasChangesSince, readiness, resubmissionComment)
    it('lets the Coordinator tell the Safety Officer what changed, and shows it with the feedback it answers', async () => {
      const { event } = await sentBack();
      await editPlan(event.id, { layoutNotes: 'Second exit added at the rear' }).expect(200);

      await resubmit(event.id)
        .send({ comment: '  Added a second exit at the rear and moved the stands apart.  ' })
        .expect(200);

      const opened = await packet(event.id).expect(200);
      expect(opened.body.history).toHaveLength(1);
      expect(opened.body.history[0]).toMatchObject({
        outcome: 'CHANGES_REQUESTED',
        reason: 'Add an exit',
        resubmissionComment: 'Added a second exit at the rear and moved the stands apart.',
      });
      // Visible to the Coordinator in their own history too.
      const mine = await reviews(event.id, 'coordinator').expect(200);
      expect(mine.body[0].resubmissionComment).toContain('second exit');
    });

    // TC-S3-185 · US-57 AC-9 · setup: base-users + tc-s3-177-setup + tc-s3-177e-setup · fails if the event returns to the queue without a change, twice, by the wrong user, or earlier checks are lost
    // Code: SafetyService.resubmit (hasChangesSince, readiness, resubmissionComment)
    it('treats a blank comment as none, and the comment as optional', async () => {
      const { event } = await sentBack();
      await editPlan(event.id, { layoutNotes: 'Second exit added at the rear' }).expect(200);

      await resubmit(event.id).send({ comment: '   ' }).expect(200);

      const opened = await packet(event.id).expect(200);
      expect(opened.body.history[0].resubmissionComment).toBeNull();
      expect(opened.body.history[0].resubmittedAt).not.toBeNull();
    });

    // TC-S3-185 · US-57 AC-9 · setup: base-users + tc-s3-177-setup + tc-s3-177e-setup · fails if the event returns to the queue without a change, twice, by the wrong user, or earlier checks are lost
    // Code: SafetyService.resubmit (hasChangesSince, readiness, resubmissionComment)
    it('refuses a comment that is too long and does not send the event back', async () => {
      const { event } = await sentBack();
      await editPlan(event.id, { layoutNotes: 'Second exit added at the rear' }).expect(200);

      await resubmit(event.id).send({ comment: 'x'.repeat(1001) }).expect(400);

      expect(await statusOf(event.id)).toBe(EventStatus.PLANNING);
    });

    // TC-S3-185 · US-57 AC-9 · setup: base-users + tc-s3-177-setup + tc-s3-177e-setup + tc-s3-177c-setup · fails if the event returns to the queue without a change, twice, by the wrong user, or earlier checks are lost
    // Code: SafetyService.resubmit (hasChangesSince, readiness, resubmissionComment)
    it('counts a changed booking as a change, and a new one that is not yet approved as not ready', async () => {
      const { event } = await sentBack();
      await given('tc-s3-177c-setup');

      const res = await resubmit(event.id).expect(409);

      expect(res.body.message).toMatch(/still pending/i);
    });

    // TC-S3-185 · US-57 AC-9 · setup: base-users + tc-s3-177-setup + tc-s3-177e-setup · fails if the event returns to the queue without a change, twice, by the wrong user, or earlier checks are lost
    // Code: SafetyService.resubmit (hasChangesSince, readiness, resubmissionComment)
    it('cannot be resubmitted twice', async () => {
      const { event } = await sentBack();
      await editPlan(event.id, { layoutNotes: 'Second exit added at the rear' }).expect(200);
      await resubmit(event.id).expect(200);

      await resubmit(event.id).expect(409);
    });

    // TC-S3-185 · US-57 AC-9 · setup: base-users + tc-s3-177-setup + tc-s3-177e-setup + tc-s3-185-setup · fails if an event cancelled while feedback waits can be sent back for a check
    // Code: SafetyService.resubmit (SAFETY_CHECK_ELIGIBLE_STATUSES)
    it('cannot send back an event that was cancelled while the feedback waited', async () => {
      const { event } = await sentBack();
      await given('tc-s3-185-setup');

      await resubmit(event.id).expect(409);

      expect(await statusOf(event.id)).toBe(EventStatus.CANCELLED);
    });

    // TC-S3-185 · US-57 AC-9 · setup: base-users + tc-s3-177-setup · fails if the event returns to the queue without a change, twice, by the wrong user, or earlier checks are lost
    // Code: SafetyService.resubmit (hasChangesSince, readiness, resubmissionComment)
    it('has nothing to answer when there is no feedback', async () => {
      const event = careersFair;

      await resubmit(event.id).expect(409);
    });

    // TC-S3-185 · US-57 AC-9 · setup: base-users + tc-s3-177-setup + tc-s3-177e-setup · fails if the event returns to the queue without a change, twice, by the wrong user, or earlier checks are lost
    // Code: SafetyService.resubmit (hasChangesSince, readiness, resubmissionComment)
    it('is the assigned Coordinator’s alone', async () => {
      const { event } = await sentBack();
      await editPlan(event.id, { layoutNotes: 'Second exit added at the rear' }).expect(200);

      await resubmit(event.id, 'otherCoordinator').expect(404);
      for (const who of ['officer', 'organiser', 'venueStaff', 'techSupport', 'attendee']) {
        await resubmit(event.id, who).expect(403);
      }
      expect(await statusOf(event.id)).toBe(EventStatus.PLANNING);
    });
  });

  describe('AC-7: reject', () => {
    // TC-S3-183 · US-57 AC-7 · setup: base-users + tc-s3-177-setup + tc-s3-177e-setup · fails if a rejected event is not blocked, stays queued, has its arrangements changed, or the Coordinator is not told why
    // Code: SafetyService.decide (REJECTED -> SAFETY_REJECTED) -> notifyCoordinator
    it('blocks the event, takes it out of the queue, leaves its arrangements alone and tells the Coordinator why', async () => {
      const { event, booking } = await queuedEvent();

      const res = await decide(event.id, { outcome: 'REJECTED', reason: 'No safe route out' }).expect(200);

      expect(res.body).toMatchObject({
        outcome: 'REJECTED',
        eventStatus: 'SAFETY_REJECTED',
        affectedArrangements: ['VENUE_BOOKING', 'EQUIPMENT_RESERVATION'],
      });
      expect(await statusOf(event.id)).toBe(EventStatus.SAFETY_REJECTED);
      expect((await queue().expect(200)).body).toEqual([]);
      expect((await prisma.venueBooking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
        BookingStatus.APPROVED,
      );
      const note = await prisma.notification.findFirstOrThrow({
        where: { relatedEventId: event.id, type: NotificationType.SAFETY_CHECK_DECIDED },
      });
      expect(note.message).toContain('No safe route out');
    });

    // TC-S3-183, TC-S3-185 · US-57 AC-7/AC-9 · setup: base-users + tc-s3-177-setup + tc-s3-177e-setup · fails if a rejected event can be resubmitted without returning to planning and changing, or is requeued by itself
    // Code: SafetyService.resubmit; start-planning from SAFETY_REJECTED
    it('is reworked by the Coordinator: resume planning, change the plan, send it back', async () => {
      const { event } = await queuedEvent();
      await decide(event.id, { outcome: 'REJECTED', reason: 'No safe route out' }).expect(200);

      // Still blocked: it must be taken back into planning first.
      await http()
        .post(`/safety/events/${event.id}/resubmit`)
        .set('Authorization', as('coordinator'))
        .expect(409);

      await http()
        .post(`/events/${event.id}/start-planning`)
        .set('Authorization', as('coordinator'))
        .expect(200);
      expect(await statusOf(event.id)).toBe(EventStatus.PLANNING);
      // Held, not requeued by itself.
      expect((await queue().expect(200)).body).toEqual([]);

      await http()
        .patch(`/events/${event.id}/planning`)
        .set('Authorization', as('coordinator'))
        .send({ layoutNotes: 'Reworked: three marked exits' })
        .expect(200);
      await http()
        .post(`/safety/events/${event.id}/resubmit`)
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(await statusOf(event.id)).toBe(EventStatus.AWAITING_SAFETY_CHECK);
      expect((await queue().expect(200)).body[0]).toMatchObject({ id: event.id, lastOutcome: 'REJECTED' });
    });
  });

  describe('AC-8: no approved check, no preparation', () => {
    // TC-S3-184 · US-57 AC-8 · setup: base-users + tc-s3-177-setup · fails if an event can reach CONFIRMED any way but an approved safety check, or be pulled out of a pending check
    // Code: event-status.machine (CONFIRMED only from the safety decision); EventConfirmationService
    it('has no route that confirms an event, whoever asks', async () => {
      const event = careersFair;

      for (const who of ['coordinator', 'officer', 'organiser']) {
        // POST /events/:id/confirm is US-42's Confirm arrangements: it leads
        // only to AWAITING_SAFETY_CHECK, and refuses here (nothing is booked).
        await http()
          .post(`/events/${event.id}/confirm`)
          .set('Authorization', as(who))
          .then((res) => expect(res.status).toBeGreaterThanOrEqual(400));
        await http()
          .patch(`/events/${event.id}`)
          .set('Authorization', as(who))
          .send({ status: 'CONFIRMED' })
          .then((res) => expect(res.status).toBeGreaterThanOrEqual(400));
      }
      expect(await statusOf(event.id)).toBe(EventStatus.PLANNING);
    });

    // TC-S3-184 · US-57 AC-8 · setup: base-users + tc-s3-177-setup + tc-s3-177e-setup · fails if an event can reach CONFIRMED any way but an approved safety check, or be pulled out of a pending check
    // Code: event-status.machine (CONFIRMED only from the safety decision); EventConfirmationService
    it('a Coordinator cannot pull an event out of its pending check', async () => {
      const { event } = await queuedEvent();

      await http().post(`/events/${event.id}/start-planning`).set('Authorization', as('coordinator')).expect(409);

      expect(await statusOf(event.id)).toBe(EventStatus.AWAITING_SAFETY_CHECK);
    });

    // TC-S3-180 · US-57 AC-4 · setup: base-users + tc-s3-177-setup · fails if a decision or a history is given for an event that does not exist
    // Code: SafetyService.decide (locked row), getHistory (officer scope)
    it('refuses a decision on, or the history of, an event that does not exist (404)', async () => {
      await decide('EVT-999', { outcome: 'APPROVED' }).expect(404);
      await reviews('EVT-999', 'officer').expect(404);

      expect(await prisma.safetyReview.count()).toBe(0);
    });

    // TC-S3-180 · US-57 AC-4 · setup: base-users + tc-s3-177-setup + tc-s3-177e-setup · fails if an event that has been decided can be decided again
    // Code: SafetyService.decide (AWAITING_SAFETY_CHECK only, 409)
    it('refuses a second decision on an event that has already been decided', async () => {
      const { event } = await queuedEvent();
      await decide(event.id, { outcome: 'APPROVED' }).expect(200);

      await decide(event.id, { outcome: 'REJECTED', reason: 'Changed my mind' }).expect(409);

      expect(await statusOf(event.id)).toBe(EventStatus.CONFIRMED);
    });

    // TC-S3-180 · US-57 AC-4 · setup: base-users + tc-s3-177-setup + tc-s3-177e-setup · fails if two simultaneous decisions are both recorded
    // Code: SafetyService.decide (status claim inside the transaction)
    it('lets only one of two simultaneous decisions win', async () => {
      const { event } = await queuedEvent();

      const results = await Promise.all([
        decide(event.id, { outcome: 'APPROVED' }),
        decide(event.id, { outcome: 'REJECTED', reason: 'No' }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await prisma.safetyReview.count({ where: { eventId: event.id } })).toBe(1);
    });
  });

  describe('AC-10: only the Safety Officer can decide', () => {
    // TC-S3-186 · US-57 AC-10 · setup: base-users + tc-s3-177-setup + tc-s3-177e-setup · fails if any other role can decide, see the queue or open a review
    // Code: SafetyController @Roles(SAFETY_OFFICER); JwtAuthGuard
    it('refuses every other role at the decision, the queue and the review', async () => {
      const { event } = await queuedEvent();

      for (const who of ['coordinator', 'organiser', 'venueStaff', 'techSupport', 'attendee']) {
        await decide(event.id, { outcome: 'APPROVED' }, who).expect(403);
        await queue(who).expect(403);
        await packet(event.id, who).expect(403);
      }
      expect(await statusOf(event.id)).toBe(EventStatus.AWAITING_SAFETY_CHECK);
      expect(await prisma.safetyReview.count()).toBe(0);
    });

    // TC-S3-186 · US-57 AC-10 · setup: base-users + tc-s3-177-setup · fails if any other role can decide, see the queue or open a review
    // Code: SafetyController @Roles(SAFETY_OFFICER); JwtAuthGuard
    it('requires authentication', async () => {
      await http().get('/safety/queue').expect(401);
    });
  });

  describe('history', () => {
    // TC-S3-185 · US-57 AC-9 · setup: base-users + tc-s3-177-setup + tc-s3-177e-setup · fails if the event's Coordinator cannot see earlier checks and reasons, or another Coordinator can
    // Code: SafetyService.getHistory
    it('shows the checks and reasons to the event’s Coordinator, and to no other Coordinator', async () => {
      const { event } = await queuedEvent();
      await decide(event.id, { outcome: 'REJECTED', reason: 'No safe route out' }).expect(200);

      const mine = await reviews(event.id, 'coordinator').expect(200);
      expect(mine.body).toHaveLength(1);
      expect(mine.body[0]).toMatchObject({ outcome: 'REJECTED', reason: 'No safe route out' });

      await reviews(event.id, 'otherCoordinator').expect(404);
      await reviews(event.id, 'organiser').expect(403);
    });
  });

  // US-64 is not one of the Sprint 3 cards (38-57), so these carry no TC-S3 tag.
  describe('US-64: Safety Officers alerted when a check is due', () => {
    const safetyNotices = (eventId: string) =>
      prisma.notification.findMany({
        where: { relatedEventId: eventId, type: NotificationType.SAFETY_CHECK_DUE },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });

    /** The event's date as the venues' clock reads it (Singapore), e.g. "13 Nov 2026". */
    const singaporeDate = (d: Date) =>
      new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Singapore',
      }).format(d);

    it('AC1: Given two Safety Officers, When the Coordinator confirms, Then each is alerted once, and nobody else', async () => {
      const { event } = await queuedEvent();

      const notes = await safetyNotices(event.id);
      expect(notes.map((n) => n.recipientId).sort()).toEqual([ids.officer, ids.officer2].sort());
    });

    it('AC2: Given a dated event, When it enters the queue, Then the alert names the event and its date', async () => {
      const { event } = await queuedEvent();

      const notes = await safetyNotices(event.id);
      for (const n of notes) {
        expect(n.message).toBe(`Safety check due: Careers Fair on ${singaporeDate(start)}`);
      }
    });

    it('AC1: Given the confirmation is refused, Then nobody is alerted', async () => {
      await given('tc-s3-177b-setup'); // BKG-161 still REQUESTED, so not ready
      const event = careersFair;

      await confirmArrangements(event.id).expect(409);

      expect(await safetyNotices(event.id)).toEqual([]);
    });

    it('AC1: Given feedback answered with a changed plan, When the Coordinator resubmits, Then every Safety Officer is alerted again', async () => {
      const { event } = await queuedEvent();
      await decide(event.id, { outcome: 'CHANGES_REQUESTED', returnStage: 'VENUE', reason: 'Add an exit' }).expect(200);
      await http()
        .patch(`/events/${event.id}/planning`)
        .set('Authorization', as('coordinator'))
        .send({ layoutNotes: 'Second exit added at the rear' })
        .expect(200);

      await http().post(`/safety/events/${event.id}/resubmit`).set('Authorization', as('coordinator')).expect(200);

      // One alert each for the confirmation, and one each for the resubmission.
      const notes = await safetyNotices(event.id);
      expect(notes.map((n) => n.recipientId).sort()).toEqual(
        [ids.officer, ids.officer, ids.officer2, ids.officer2].sort(),
      );
    });

    it('AC1: the alert is in the officer’s inbox, titled by type and linked to the existing safety check page', async () => {
      const { event } = await queuedEvent();

      const inbox = await http().get('/notifications').set('Authorization', as('officer2')).expect(200);

      expect(inbox.body).toHaveLength(1);
      expect(inbox.body[0]).toMatchObject({
        type: 'SAFETY_CHECK_DUE',
        read: false,
        relatedEvent: { id: event.id, name: 'Careers Fair' },
        link: `/safety/checks/${event.id}`,
      });
    });
  });
});
