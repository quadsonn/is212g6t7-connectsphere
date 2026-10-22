import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BookingStatus,
  EventStatus,
  NotificationType,
  PrismaClient,
  ReservationStatus,
  Role,
  VenueStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { listenOnLoopback } from './listen-on-loopback';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Requirement change 6 e2e — the operational safety check, end to end through
 * the real wiring: the Coordinator confirms the arrangements once they are
 * ready (US-42), which puts the event in the queue; the Safety Officer
 * decides, and CONFIRMED is reachable no other way.
 */
describe('Safety check (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const seedUser = async (key: string, role: Role, name = key) => {
    // Login lower-cases the email, so store it lower-cased too.
    const email = `${key.toLowerCase()}@example.com`;
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 4), name, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  const start = new Date(Date.now() + 30 * DAY);
  const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);

  const seedEvent = (overrides: Record<string, unknown> = {}) =>
    prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        coordinatorId: ids.coordinator,
        name: 'Careers Fair',
        purpose: 'Meet employers',
        description: 'Stalls and talks',
        category: 'Careers',
        proposedStart: start,
        proposedEnd: end,
        expectedAttendance: 150,
        preferredLayout: 'THEATRE',
        accessibilityRequirements: ['STEP_FREE_ACCESS'],
        status: EventStatus.PLANNING,
        ...overrides,
      },
    });

  let slot = 0;
  /** Each call gets its own day: the venue refuses two approved bookings at once. */
  const seedBooking = (eventId: string, status: BookingStatus = BookingStatus.REQUESTED) => {
    const day = (slot += 1) * DAY;
    return prisma.venueBooking.create({
      data: {
        eventId,
        venueId: ids.venue,
        start: new Date(start.getTime() + day),
        end: new Date(end.getTime() + day),
        status,
        requestedById: ids.coordinator,
      },
    });
  };

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

  /** An event with an approved booking, sitting in the Safety queue. */
  const queuedEvent = async (overrides: Record<string, unknown> = {}) => {
    const event = await seedEvent(overrides);
    const booking = await seedBooking(event.id, BookingStatus.APPROVED);
    await confirmArrangements(event.id).expect(200);
    expect(await statusOf(event.id)).toBe(EventStatus.AWAITING_SAFETY_CHECK);
    return { event, booking };
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await listenOnLoopback(app);

    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.safetyReview.deleteMany();
    await prisma.bookingDecision.deleteMany();
    await prisma.venueBooking.deleteMany();
    await prisma.venueBlock.deleteMany();
    await prisma.equipmentReservation.deleteMany();
    await prisma.equipmentRequirement.deleteMany();
    await prisma.eventChange.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.venue.deleteMany();
    await prisma.equipment.deleteMany();
    await prisma.user.deleteMany();

    await seedUser('organiser', Role.EVENT_ORGANISER);
    await seedUser('coordinator', Role.EVENT_COORDINATOR, 'Marcus');
    await seedUser('otherCoordinator', Role.EVENT_COORDINATOR);
    await seedUser('officer', Role.SAFETY_OFFICER, 'Sam');
    // US-64: a second officer, to show every Safety Officer is told.
    await seedUser('officer2', Role.SAFETY_OFFICER, 'Mei');
    await seedUser('venueStaff', Role.VENUE_STAFF);
    await seedUser('techSupport', Role.TECHNICAL_SUPPORT_STAFF);
    await seedUser('attendee', Role.ATTENDEE);

    const venue = await prisma.venue.create({
      data: {
        name: 'Main Hall',
        location: 'Student Centre',
        capacity: 200,
        operatingInfo: 'No open flames. Maximum two doors in use after 22:00.',
        status: VenueStatus.PUBLISHED,
        managedById: ids.venueStaff,
      },
    });
    ids.venue = venue.id;

    const mic = await prisma.equipment.create({
      data: { type: 'Wireless microphone', totalQuantity: 10 },
    });
    ids.mic = mic.id;
  });

  describe('AC-1: an event enters the queue once its arrangements are confirmed', () => {
    it('enters the queue when the Coordinator confirms the ready arrangements (US-42), not on its own', async () => {
      const event = await seedEvent();
      const booking = await seedBooking(event.id);

      await approveBooking(booking.id).expect(200);

      // Ready, but nothing moves until the Coordinator confirms.
      expect(await statusOf(event.id)).toBe(EventStatus.PLANNING);
      expect((await queue().expect(200)).body).toEqual([]);

      await confirmArrangements(event.id).expect(200);

      expect(await statusOf(event.id)).toBe(EventStatus.AWAITING_SAFETY_CHECK);
      const res = await queue().expect(200);
      expect(res.body.map((e: { id: string }) => e.id)).toEqual([event.id]);
    });

    it('waits while any booking is still pending', async () => {
      const event = await seedEvent();
      const first = await seedBooking(event.id);
      await seedBooking(event.id);

      await approveBooking(first.id).expect(200);
      await confirmArrangements(event.id).expect(409);

      expect(await statusOf(event.id)).toBe(EventStatus.PLANNING);
      expect((await queue().expect(200)).body).toEqual([]);
    });

    it('waits for requested equipment to be reserved, then can be confirmed', async () => {
      const event = await seedEvent();
      await prisma.equipmentRequirement.create({
        data: { eventId: event.id, equipmentId: ids.mic, equipmentType: 'Wireless microphone', quantity: 4 },
      });
      const booking = await seedBooking(event.id);
      await approveBooking(booking.id).expect(200);
      await confirmArrangements(event.id).expect(409);

      await reserve(event.id, ids.mic, 4).expect(201);
      await confirmArrangements(event.id).expect(200);

      expect(await statusOf(event.id)).toBe(EventStatus.AWAITING_SAFETY_CHECK);
    });

    it('lists the longest-waiting event first', async () => {
      const older = await queuedEvent({ name: 'Older' });
      await new Promise((resolve) => setTimeout(resolve, 20));
      const newer = await queuedEvent({ name: 'Newer' });

      const res = await queue().expect(200);

      expect(res.body.map((e: { id: string }) => e.id)).toEqual([older.event.id, newer.event.id]);
    });

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
  });

  describe('AC-2: the review shows what the Safety Officer needs', () => {
    it('shows attendance, venue capacity, layout, accessibility, equipment and venue restrictions', async () => {
      const { event, booking } = await queuedEvent();
      await prisma.equipmentRequirement.create({
        data: { eventId: event.id, equipmentId: ids.mic, equipmentType: 'Wireless microphone', quantity: 2 },
      });
      await prisma.equipmentReservation.create({
        data: { eventId: event.id, equipmentId: ids.mic, quantity: 2, start, end, status: ReservationStatus.APPROVED },
      });
      await prisma.venueBlock.create({
        data: {
          venueId: ids.venue,
          start: new Date(booking.start.getTime() + 60 * 60 * 1000),
          end: new Date(booking.start.getTime() + 2 * 60 * 60 * 1000),
          reason: 'Fire alarm testing',
          createdById: ids.venueStaff,
        },
      });

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

    it('does not open an event that is not awaiting a check', async () => {
      const event = await seedEvent();

      await packet(event.id).expect(404);
    });
  });

  describe('AC-4/AC-5: approving', () => {
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
    it.each(['REJECTED', 'CHANGES_REQUESTED'])('%s without a reason is refused and changes nothing', async (outcome) => {
      const { event } = await queuedEvent();

      await decide(event.id, { outcome, returnStage: 'VENUE' }).expect(400);
      await decide(event.id, { outcome, returnStage: 'VENUE', reason: '   ' }).expect(400);

      expect(await statusOf(event.id)).toBe(EventStatus.AWAITING_SAFETY_CHECK);
      expect(await prisma.safetyReview.count()).toBe(0);
    });

    it('requesting changes also needs the stage to return to', async () => {
      const { event } = await queuedEvent();

      await decide(event.id, { outcome: 'CHANGES_REQUESTED', reason: 'Too crowded' }).expect(400);
      await decide(event.id, { outcome: 'CHANGES_REQUESTED', reason: 'Too crowded', returnStage: 'ANYWHERE' }).expect(400);
    });
  });

  describe('AC-6: request changes — back to the Coordinator', () => {
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

    it('returning to technical planning flags the equipment and leaves it reserved', async () => {
      const event = await seedEvent();
      const booking = await seedBooking(event.id, BookingStatus.APPROVED);
      await prisma.equipmentRequirement.create({
        data: { eventId: event.id, equipmentId: ids.mic, equipmentType: 'Wireless microphone', quantity: 2 },
      });
      const reservation = await prisma.equipmentReservation.create({
        data: { eventId: event.id, equipmentId: ids.mic, quantity: 2, start, end, status: ReservationStatus.APPROVED },
      });
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

    it('refuses to resubmit an event nothing has changed on', async () => {
      const { event } = await sentBack();

      const res = await resubmit(event.id).expect(409);

      expect(res.body.message).toMatch(/nothing has changed/i);
      expect(await statusOf(event.id)).toBe(EventStatus.PLANNING);
    });

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

    it('treats a blank comment as none, and the comment as optional', async () => {
      const { event } = await sentBack();
      await editPlan(event.id, { layoutNotes: 'Second exit added at the rear' }).expect(200);

      await resubmit(event.id).send({ comment: '   ' }).expect(200);

      const opened = await packet(event.id).expect(200);
      expect(opened.body.history[0].resubmissionComment).toBeNull();
      expect(opened.body.history[0].resubmittedAt).not.toBeNull();
    });

    it('refuses a comment that is too long and does not send the event back', async () => {
      const { event } = await sentBack();
      await editPlan(event.id, { layoutNotes: 'Second exit added at the rear' }).expect(200);

      await resubmit(event.id).send({ comment: 'x'.repeat(1001) }).expect(400);

      expect(await statusOf(event.id)).toBe(EventStatus.PLANNING);
    });

    it('counts a changed booking as a change, and a new one that is not yet approved as not ready', async () => {
      const { event } = await sentBack();
      await seedBooking(event.id, BookingStatus.REQUESTED);

      const res = await resubmit(event.id).expect(409);

      expect(res.body.message).toMatch(/still pending/i);
    });

    it('cannot be resubmitted twice', async () => {
      const { event } = await sentBack();
      await editPlan(event.id, { layoutNotes: 'Second exit added at the rear' }).expect(200);
      await resubmit(event.id).expect(200);

      await resubmit(event.id).expect(409);
    });

    it('has nothing to answer when there is no feedback', async () => {
      const event = await seedEvent();

      await resubmit(event.id).expect(409);
    });

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
    it('has no route that confirms an event, whoever asks', async () => {
      const event = await seedEvent();

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

    it('a Coordinator cannot pull an event out of its pending check', async () => {
      const { event } = await queuedEvent();

      await http().post(`/events/${event.id}/start-planning`).set('Authorization', as('coordinator')).expect(409);

      expect(await statusOf(event.id)).toBe(EventStatus.AWAITING_SAFETY_CHECK);
    });

    it('refuses a second decision on an event that has already been decided', async () => {
      const { event } = await queuedEvent();
      await decide(event.id, { outcome: 'APPROVED' }).expect(200);

      await decide(event.id, { outcome: 'REJECTED', reason: 'Changed my mind' }).expect(409);

      expect(await statusOf(event.id)).toBe(EventStatus.CONFIRMED);
    });

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

    it('requires authentication', async () => {
      await http().get('/safety/queue').expect(401);
    });
  });

  describe('history', () => {
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
      const event = await seedEvent();
      await seedBooking(event.id); // still REQUESTED, so not ready

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
