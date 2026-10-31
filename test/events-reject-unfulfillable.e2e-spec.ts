import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus, EventStatus, NotificationType, PrismaClient, ReservationStatus } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-47 e2e — the Coordinator rejects an approved request that cannot be
 * fulfilled. One describe per acceptance criterion, named "US-47 AC-n".
 *
 * Code under test: EventsUnfulfillableService.reject (POST
 * /events/:id/reject-unfulfillable, RejectUnfulfillableDto), releasing venue
 * bookings and equipment reservations, and the Organiser's notification.
 *
 * Pre-condition for every test: reset the testDB, then run base-users.sql and
 * tc-s3-107-setup.sql (the "gala" EVT-238 with its bookings and reservations,
 * "next" EVT-247 and "bystander" EVT-248). The status tests also load
 * tc-s3-107b-setup.sql (one "other" event per status).
 */
describe('US-47 reject unfulfillable request (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  /** Fixed rows from base-users and tc-s3-107-setup. */
  const ids: Record<string, string> = {
    organiser: 'USR-006',
    coordinator: 'USR-004',
    otherCoordinator: 'USR-005',
    staff: 'USR-010',
    tech: 'USR-009',
    attendee: 'USR-001',
    hallA: 'VEN-060',
    hallB: 'VEN-061',
    hallC: 'VEN-062',
    projector: 'EQP-018',
    gala: 'EVT-238',
    next: 'EVT-247',
    bystander: 'EVT-248',
    pendingHold: 'BKG-110',
    approvedBooking: 'BKG-111',
    rejectedRequest: 'BKG-112',
    bystanderBooking: 'BKG-113',
  };
  const LOGINS: Record<string, string> = {
    organiser: 'organiser@example.com',
    coordinator: 'coord.a@example.com',
    otherCoordinator: 'coord.b@example.com',
    staff: 'venue.staff@example.com',
    tech: 'tech.support@example.com',
    attendee: 'attendee@example.com',
  };
  /** tc-s3-107b-setup: one "other" event per status. */
  const OTHER: Record<string, string> = {
    APPROVED: 'EVT-239',
    AWAITING_ARRANGEMENTS: 'EVT-240',
    SUBMITTED: 'EVT-241',
    UNDER_REVIEW: 'EVT-242',
    CONFIRMED: 'EVT-243',
    COMPLETED: 'EVT-244',
    CANCELLED: 'EVT-245',
    REJECTED: 'EVT-246',
  };

  const START = '2030-10-01T01:00:00.000Z';
  const END = '2030-10-01T09:00:00.000Z';

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const reject = (body: object, who = 'coordinator', event = 'gala') =>
    http()
      .post(`/events/${ids[event]}/reject-unfulfillable`)
      .set('Authorization', as(who))
      .send(body);

  const VALID = { reason: 'NO_SUITABLE_VENUE', comment: 'Every hall is booked that week.' };

  /** The "other" event in `status` (loads tc-s3-107b-setup). */
  const seedEvent = async (key: 'other', status: EventStatus) => {
    await loadSql(prisma, 'tc-s3-107b-setup');
    ids[key] = OTHER[status];
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
    await loadSql(prisma, 'base-users');
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
    await loadSql(prisma, 'base-users');
    await loadSql(prisma, 'tc-s3-107-setup');
  });

  describe('US-47 AC-1/AC-4: rejecting from the event sets it to Rejected through the normal path', () => {
    // TC-S3-107, TC-S3-110 · US-47 AC-1/AC-4 · setup: base-users + tc-s3-107-setup · fails if the Coordinator cannot reject from the event, or the status is not Rejected
    // Code: EventsUnfulfillableService.reject -> setStatus(REJECTED)
    it('rejects the event and stores the reason and comment', async () => {
      const res = await reject(VALID).expect(200);

      expect(res.body).toEqual({
        eventId: ids.gala,
        status: 'REJECTED',
        decisionReason: 'No suitable venue: Every hall is booked that week.',
        releasedVenueBookings: 2,
        releasedEquipmentReservations: 2,
      });
      const event = await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.gala } });
      expect(event.status).toBe(EventStatus.REJECTED);
    });

    // TC-S3-110 · US-47 AC-4 · setup: base-users + tc-s3-107-setup · fails if rejecting changes anything but the status and reason
    // Code: EventsUnfulfillableService.reject
    it('changes nothing else about the event', async () => {
      const before = await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.gala } });

      await reject(VALID).expect(200);

      const after = await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.gala } });
      const { status: _s1, decisionReason: _d1, updatedAt: _u1, ...rest } = after;
      const { status: _s2, decisionReason: _d2, updatedAt: _u2, ...restBefore } = before;
      expect(rest).toEqual(restBefore);
    });

    // TC-S3-110 · US-47 AC-4 · setup: base-users + tc-s3-107-setup + tc-s3-107b-setup · fails if an approved event, or one awaiting arrangements, cannot be rejected
    // Code: EventsUnfulfillableService.reject (allowed statuses)
    it.each([EventStatus.APPROVED, EventStatus.AWAITING_ARRANGEMENTS])(
      'is allowed from %s too',
      async (status) => {
        await seedEvent('other', status);
        await reject(VALID, 'coordinator', 'other').expect(200);
      },
    );

    // TC-S3-110 · US-47 AC-4 · setup: base-users + tc-s3-107-setup + tc-s3-107b-setup · fails if an event outside planning can be rejected as unfulfillable
    // Code: EventsUnfulfillableService.reject (allowed statuses)
    it.each([
      EventStatus.SUBMITTED,
      EventStatus.UNDER_REVIEW,
      EventStatus.CONFIRMED,
      EventStatus.COMPLETED,
      EventStatus.CANCELLED,
      EventStatus.REJECTED,
    ])('is refused from %s (409), changing nothing', async (status) => {
      await seedEvent('other', status);

      const res = await reject(VALID, 'coordinator', 'other').expect(409);

      expect(res.body.message).toBe(`an event that is ${status} cannot be rejected as unfulfillable`);
      const event = await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.other } });
      expect(event).toMatchObject({ status, decisionReason: null });
    });

    // TC-S3-110 · US-47 AC-4 · setup: base-users + tc-s3-107-setup · fails if the review rejection now reaches events being arranged
    // Code: EventsService.reject transition table
    it("leaves US-08's review rejection as it was: refused for an event being arranged", async () => {
      const res = await http()
        .post(`/events/${ids.gala}/reject`)
        .set('Authorization', as('coordinator'))
        .send({ reason: 'No.' })
        .expect(409);

      expect(res.body.message).toBe('cannot change status from PLANNING to REJECTED');
      expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.gala } })).status).toBe(
        EventStatus.PLANNING,
      );
    });
  });

  describe('US-47 AC-2: each reason category, with a comment', () => {
    // TC-S3-108 · US-47 AC-2 · setup: base-users + tc-s3-107-setup · fails if a reason category or the comment is lost
    // Code: RejectUnfulfillableDto reason enum + comment
    it.each([
      ['NO_SUITABLE_VENUE', 'No suitable venue'],
      ['NO_AVAILABLE_EQUIPMENT', 'No available equipment'],
      ['NO_VENUE_OR_EQUIPMENT', 'No suitable venue or available equipment'],
    ])('records %s', async (reason, label) => {
      const res = await reject({ reason, comment: 'Tried everything.' }).expect(200);

      expect(res.body.decisionReason).toBe(`${label}: Tried everything.`);
      const event = await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.gala } });
      expect(event.decisionReason).toBe(`${label}: Tried everything.`);
    });
  });

  describe('US-47 AC-3: cannot be submitted without a reason', () => {
    // TC-S3-109 · US-47 AC-3 · setup: base-users + tc-s3-107-setup · fails if a rejection without a reason or comment is accepted, or releases anything
    // Code: RejectUnfulfillableDto (@IsEnum reason, @Trim @IsNotEmpty comment)
    it.each([
      ['no reason', { comment: 'x' }, 'a reason is required'],
      ['an unknown reason', { reason: 'TOO_EXPENSIVE', comment: 'x' }, 'a reason is required'],
      ['no comment', { reason: 'NO_SUITABLE_VENUE' }, 'a comment is required to reject this request'],
      ['a blank comment', { reason: 'NO_SUITABLE_VENUE', comment: '  ' }, 'a comment is required to reject this request'],
    ])('400s with %s, and changes and releases nothing', async (_label, body, message) => {
      const res = await reject(body).expect(400);

      expect(res.body.message.join(' ')).toContain(message);
      expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.gala } })).status).toBe(
        EventStatus.PLANNING,
      );
      expect(await prisma.venueBooking.count({ where: { status: BookingStatus.RELEASED } })).toBe(0);
      expect(
        await prisma.equipmentReservation.count({ where: { status: ReservationStatus.RELEASED } }),
      ).toBe(0);
    });
  });

  describe('US-47 AC-5: tentative holds and reservations are released, records kept', () => {
    // TC-S3-111 · US-47 AC-5 · setup: base-users + tc-s3-107-setup · fails if a hold or approved booking stays held, or a record is deleted
    // Code: EventsUnfulfillableService.reject -> BookingsService release
    it("releases the event's pending and approved bookings, keeping them linked", async () => {
      await reject(VALID).expect(200);

      // By id, not creation order: rows seeded in the same millisecond tie on
      // createdAt, so their order would not be stable.
      const bookings = await prisma.venueBooking.findMany({ where: { eventId: ids.gala } });
      const byId = new Map(bookings.map((b) => [b.id, b]));
      expect(bookings).toHaveLength(3);
      expect(byId.get(ids.pendingHold)).toMatchObject({ status: BookingStatus.RELEASED });
      expect(byId.get(ids.approvedBooking)).toMatchObject({ status: BookingStatus.RELEASED });
      // Already rejected: held nothing, so nothing to release.
      expect(byId.get(ids.rejectedRequest)).toMatchObject({
        status: BookingStatus.REJECTED,
        releasedAt: null,
      });
      expect(byId.get(ids.pendingHold)!.releasedAt).not.toBeNull();
      expect(byId.get(ids.approvedBooking)!.releasedAt).not.toBeNull();
    });

    // TC-S3-111 · US-47 AC-5 · setup: base-users + tc-s3-107-setup · fails if a reservation stays held
    // Code: EventsUnfulfillableService.reject -> EquipmentReservationsService.releaseForCancelledEvent
    it('releases its equipment reservations through the US-33 release', async () => {
      await reject(VALID).expect(200);

      const reservations = await prisma.equipmentReservation.findMany({ where: { eventId: ids.gala } });
      expect(reservations).toHaveLength(2);
      for (const r of reservations) {
        expect(r.status).toBe(ReservationStatus.RELEASED);
        expect(r.releasedAt).not.toBeNull();
      }
    });

    // TC-S3-111 · US-47 AC-5 · setup: base-users + tc-s3-107-setup · fails if released equipment still counts as reserved
    // Code: equipment-availability.ts ignores RELEASED
    it('makes the equipment available again in availability checks', async () => {
      const check = () =>
        http()
          .get(`/equipment/${ids.projector}/availability`)
          .query({ start: START, end: END, quantity: 4 })
          .set('Authorization', as('tech'));

      expect((await check().expect(200)).body).toMatchObject({ availableQuantity: 1, fullyAvailable: false });

      await reject(VALID).expect(200);

      expect((await check().expect(200)).body).toMatchObject({ availableQuantity: 4, fullyAvailable: true });
    });

    // TC-S3-111 · US-47 AC-5 · setup: base-users + tc-s3-107-setup · fails if the released venue slot stays blocked
    // Code: BookingsService.request overlap check ignores RELEASED
    it('frees the venue: the approved slot can be booked by another event', async () => {
      await reject(VALID).expect(200);

      await http()
        .post('/bookings')
        .set('Authorization', as('coordinator'))
        .send({ eventId: ids.next, venueId: ids.hallB, start: START, end: END, expectedAttendance: 50 })
        .expect(201);
    });

    // TC-S3-111 · US-47 AC-5 · setup: base-users + tc-s3-107-setup · fails if rejecting one event releases another's arrangements
    // Code: EventsUnfulfillableService.reject scopes to the event
    it("never touches another event's bookings or reservations", async () => {
      // "bystander" (EVT-248): hallC approved, and 1 projector on 1 Nov 2030 (tc-s3-107-setup).
      await reject(VALID).expect(200);

      expect(
        (await prisma.venueBooking.findUniqueOrThrow({ where: { id: ids.bystanderBooking } })).status,
      ).toBe(BookingStatus.APPROVED);
      expect(
        await prisma.equipmentReservation.count({
          where: { eventId: ids.bystander, status: ReservationStatus.APPROVED },
        }),
      ).toBe(1);
    });
  });

  describe('US-47 AC-6: the Organiser is notified with the reason and comment', () => {
    // TC-S3-112 · US-47 AC-6 · setup: base-users + tc-s3-107-setup · fails if the Organiser is not told, or the notice lacks the reason and comment
    // Code: EventsUnfulfillableService.reject -> notifySafely
    it('notifies the Organiser, and only them', async () => {
      await reject({ reason: 'NO_VENUE_OR_EQUIPMENT', comment: 'Nothing fits 120 people.' }).expect(200);

      // US-67 also tells the Coordinator their equipment was released; that is
      // its own notice, not the rejection, so it is set aside here.
      const notices = await prisma.notification.findMany();
      const others = notices.filter((n) => n.type !== NotificationType.EVENT_STATUS_CHANGED);
      expect(others).toEqual(
        others.map(() =>
          expect.objectContaining({
            recipientId: ids.coordinator,
            type: NotificationType.EQUIPMENT_RELEASED,
          }),
        ),
      );

      const rejections = notices.filter((n) => n.type === NotificationType.EVENT_STATUS_CHANGED);
      expect(rejections).toEqual([
        expect.objectContaining({
          recipientId: ids.organiser,
          type: NotificationType.EVENT_STATUS_CHANGED,
          relatedEventId: ids.gala,
          message:
            'Your event request "gala" has been rejected because it cannot be fulfilled. ' +
            'Reason: No suitable venue or available equipment: Nothing fits 120 people.',
        }),
      ]);
    });

    // TC-S3-112 · US-47 AC-6 · setup: base-users + tc-s3-107-setup · fails if the Organiser's request does not show the rejection and reason
    // Code: EventsService.findMyRequest statusView
    it('shows the Organiser the rejection and its reason on their request', async () => {
      await reject(VALID).expect(200);

      const res = await http()
        .get(`/events/mine/${ids.gala}`)
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body.status).toBe('REJECTED');
      expect(res.body.statusView.decision).toEqual({
        outcome: 'REJECTED',
        reason: 'No suitable venue: Every hall is booked that week.',
      });
    });
  });

  describe('US-47: only the responsible Coordinator can reject', () => {
    // TC-S3-107 · US-47 AC-1 · setup: base-users + tc-s3-107-setup · fails if a Coordinator not responsible for the event can reject it
    // Code: EventsUnfulfillableService.reject -> AccessControlService
    it("refuses another Coordinator (404: the event is not theirs to see), changing nothing", async () => {
      await reject(VALID, 'otherCoordinator').expect(404);

      expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.gala } })).status).toBe(
        EventStatus.PLANNING,
      );
      expect(await prisma.notification.count()).toBe(0);
    });

    // TC-S3-107 · US-47 AC-1 · setup: base-users + tc-s3-107-setup · fails if another role can reject the event
    // Code: @Roles(EVENT_COORDINATOR)
    it.each(['organiser', 'staff', 'tech', 'attendee'])('is refused to %s (403)', async (who) => {
      await reject(VALID, who).expect(403);
    });
  });
});
