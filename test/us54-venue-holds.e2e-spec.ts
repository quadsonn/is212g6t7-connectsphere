import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BookingDecisionKind,
  BookingStatus,
  EventStatus,
  NotificationType,
  PrismaClient,
  Role,
  VenueStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { BookingsService } from '../src/bookings/bookings.service';
import { HoldExpiryScheduler } from '../src/bookings/hold-expiry.scheduler';

/**
 * US-54 e2e — tentative venue holds with expiry (Week 7 Customer Change #4).
 *
 * The expiry job is never started here (ScheduleModule does not run its
 * timers under test); tests call its two jobs directly, which is also how the
 * "correctness without the cron" cases prove they do not rely on it.
 */
describe('US-54 tentative venue holds (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const at = (time: string, day = '2030-10-01') => new Date(`${day}T${time}:00Z`);
  const fromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000);

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: key, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  const seedVenue = (name: string, managedById: string) =>
    prisma.venue.create({
      data: { name, location: 'Level 1', capacity: 300, status: VenueStatus.PUBLISHED, managedById },
    });

  const seedEvent = (
    name = 'Gala',
    {
      status = EventStatus.PLANNING,
      coordinatorId = ids.coordinator,
    }: { status?: EventStatus; coordinatorId?: string | null } = {},
  ) =>
    prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        coordinatorId,
        name,
        purpose: 'Celebrate',
        description: 'An evening',
        category: 'Social',
        proposedStart: at('18:00'),
        proposedEnd: at('22:00'),
        expectedAttendance: 120,
        status,
      },
    });

  /** A hold written directly — the only way to get one that has already expired. */
  const seedHold = (eventId: string, holdExpiresAt: Date, start = at('18:00'), end = at('22:00')) =>
    prisma.venueBooking.create({
      data: {
        eventId,
        venueId: ids.hall,
        start,
        end,
        status: BookingStatus.HELD,
        holdExpiresAt,
        heldById: ids.staffA,
      },
    });

  const seedBooking = (eventId: string, status: BookingStatus, start = at('18:00'), end = at('22:00')) =>
    prisma.venueBooking.create({
      data: { eventId, venueId: ids.hall, start, end, status, requestedById: ids.coordinator, expectedAttendance: 120 },
    });

  const placeHold = (body: object, who = 'staffA', venueId = ids.hall) =>
    http().post(`/venues/${venueId}/holds`).set('Authorization', as(who)).send(body);

  const holdBody = (eventId: string, overrides: object = {}) => ({
    eventId,
    start: at('18:00'),
    end: at('22:00'),
    expiresAt: fromNow(48),
    ...overrides,
  });

  const hold = (id: string, action: 'convert' | 'extend' | 'release', body: object = {}, who = 'staffA') =>
    http().post(`/bookings/${id}/hold/${action}`).set('Authorization', as(who)).send(body);

  const requestBooking = (eventId: string, start = at('18:00'), end = at('22:00')) =>
    http()
      .post('/bookings')
      .set('Authorization', as('coordinator'))
      .send({ eventId, venueId: ids.hall, start, end, expectedAttendance: 120 });

  const statusOf = async (id: string) => (await prisma.venueBooking.findUniqueOrThrow({ where: { id } })).status;

  const notices = (type: NotificationType) =>
    prisma.notification.findMany({ where: { type }, orderBy: { recipientId: 'asc' } });

  const recipients = async (type: NotificationType) => (await notices(type)).map((n) => n.recipientId).sort();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    await prisma.notification.deleteMany();
    await prisma.bookingDecision.deleteMany();
    await prisma.venueBooking.deleteMany();
    await prisma.venueBlock.deleteMany();
    await prisma.venue.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();

    await seedUser('staffA', 'staff.a@example.com', Role.VENUE_STAFF);
    await seedUser('staffB', 'staff.b@example.com', Role.VENUE_STAFF);
    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);
    await seedUser('lead', 'lead@example.com', Role.EVENT_COORDINATOR_LEAD);

    ids.hall = (await seedVenue('Main Hall', ids.staffA)).id;
    ids.annex = (await seedVenue('East Annex', ids.staffB)).id;
  });

  describe('AC-1: placing a hold', () => {
    it('US-54: Venue Staff hold a free slot for an event, with an expiry', async () => {
      const event = await seedEvent();
      const expiresAt = fromNow(48);

      const res = await placeHold(holdBody(event.id, { expiresAt })).expect(201);

      expect(res.body).toMatchObject({
        status: BookingStatus.HELD,
        eventId: event.id,
        venueId: ids.hall,
        heldById: ids.staffA,
        holdExpiresAt: expiresAt.toISOString(),
        warnings: [],
      });
    });

    it('US-54: lists the bookable events to hold for, with only the fields the picker needs', async () => {
      const gala = await seedEvent('Gala');
      await seedEvent('Draft', { status: EventStatus.DRAFT });

      const res = await http()
        .get(`/venues/${ids.hall}/holdable-events`)
        .set('Authorization', as('staffA'))
        .expect(200);

      expect(res.body).toEqual([
        {
          id: gala.id,
          name: 'Gala',
          proposedStart: at('18:00').toISOString(),
          proposedEnd: at('22:00').toISOString(),
          expectedAttendance: 120,
          coordinator: { id: ids.coordinator, name: 'coordinator' },
        },
      ]);
      await http().get(`/venues/${ids.hall}/holdable-events`).set('Authorization', as('staffB')).expect(404);
    });
  });

  describe('AC-2 and access: validation', () => {
    it('US-54: an expiry in the past is refused (400)', async () => {
      const event = await seedEvent();
      await placeHold(holdBody(event.id, { expiresAt: fromNow(-1) })).expect(400);
    });

    it('US-54: an expiry at or after the event starts is refused (400)', async () => {
      const event = await seedEvent();
      await placeHold(holdBody(event.id, { expiresAt: at('18:00') })).expect(400);
      await placeHold(holdBody(event.id, { expiresAt: at('19:00') })).expect(400);
    });

    it('US-54: an expiry after the held slot starts is refused, even before the event (400)', async () => {
      const event = await seedEvent();
      await placeHold(
        holdBody(event.id, { start: at('09:00', '2030-09-30'), end: at('12:00', '2030-09-30'), expiresAt: at('10:00', '2030-09-30') }),
      ).expect(400);
    });

    it('US-54: other roles are refused (403); Venue Staff who do not manage the venue get not found (404)', async () => {
      const event = await seedEvent();
      await placeHold(holdBody(event.id), 'coordinator').expect(403);
      await placeHold(holdBody(event.id), 'staffB').expect(404);
      expect(await prisma.venueBooking.count()).toBe(0);
    });

    it('US-54: an event that is not at a planning stage cannot be held for (409)', async () => {
      const event = await seedEvent('Submitted', { status: EventStatus.SUBMITTED });
      await placeHold(holdBody(event.id)).expect(409);
    });
  });

  describe('AC-3: a live hold hard-blocks; REQUESTED stays soft', () => {
    it('US-54: a booking request overlapping a live hold is refused (409)', async () => {
      const held = await seedEvent('Held');
      const other = await seedEvent('Other');
      const h = (await placeHold(holdBody(held.id)).expect(201)).body;

      const res = await requestBooking(other.id, at('20:00'), at('23:00')).expect(409);

      expect(res.body.conflicts).toEqual([
        expect.objectContaining({ kind: 'BOOKING', bookingId: h.id, status: BookingStatus.HELD }),
      ]);
    });

    it('US-54: a hold overlapping a live hold is refused (409)', async () => {
      const a = await seedEvent('A');
      const b = await seedEvent('B');
      await placeHold(holdBody(a.id)).expect(201);

      await placeHold(holdBody(b.id, { start: at('21:00'), end: at('23:00') })).expect(409);
    });

    it('US-54: a hold overlapping an APPROVED booking is refused (409)', async () => {
      const a = await seedEvent('A');
      const b = await seedEvent('B');
      await seedBooking(a.id, BookingStatus.APPROVED);

      await placeHold(holdBody(b.id)).expect(409);
    });

    it('US-54: a hold overlapping a pending request goes through with a soft warning', async () => {
      const a = await seedEvent('A');
      const b = await seedEvent('B');
      const pending = await seedBooking(a.id, BookingStatus.REQUESTED);

      const res = await placeHold(holdBody(b.id)).expect(201);

      expect(res.body.warnings).toEqual([
        expect.objectContaining({
          code: 'OVERLAPS_PENDING_REQUEST',
          conflicts: [expect.objectContaining({ bookingId: pending.id })],
        }),
      ]);
    });
  });

  describe('AC-6: an expired hold is free without the expiry job', () => {
    it('US-54: an expired, unreleased hold does not block a request, and approving it succeeds despite the DB constraint', async () => {
      const held = await seedEvent('Held');
      const other = await seedEvent('Other');
      const expired = await seedHold(held.id, fromNow(-1));

      const req = await requestBooking(other.id).expect(201);
      expect(req.body.warnings).toEqual([]);

      await http().post(`/bookings/${req.body.id}/approve`).set('Authorization', as('staffA')).send({}).expect(200);

      expect(await statusOf(req.body.id)).toBe(BookingStatus.APPROVED);
      expect(await prisma.venueBooking.findUniqueOrThrow({ where: { id: expired.id } })).toMatchObject({
        status: BookingStatus.RELEASED,
        releaseReason: 'Hold expired',
      });
      // Released on the way, and its expiry notice sent once (Coordinator + manager).
      expect(await recipients(NotificationType.HOLD_EXPIRED)).toEqual([ids.coordinator, ids.staffA].sort());
    });

    it('US-54: an expired hold never shows as held or confirmed — calendar, availability and search', async () => {
      const event = await seedEvent();
      await seedHold(event.id, fromNow(-1));

      const calendar = await http()
        .get(`/calendar?from=${at('00:00').toISOString()}&to=${at('00:00', '2030-10-03').toISOString()}`)
        .set('Authorization', as('staffA'))
        .expect(200);
      expect(calendar.body.entries).toEqual([]);

      const days = await http()
        .get(`/venues/${ids.hall}/availability?from=2030-10-01&to=2030-10-02`)
        .set('Authorization', as('coordinator'))
        .expect(200);
      expect(days.body.map((d: { status: string }) => d.status)).toEqual(['free', 'free']);

      const search = await http()
        .get(`/venues/search?from=${at('18:00').toISOString()}&to=${at('22:00').toISOString()}`)
        .set('Authorization', as('coordinator'))
        .expect(200);
      expect(search.body.map((v: { name: string }) => v.name)).toContain('Main Hall');

      expect(await prisma.venueBooking.count({ where: { status: BookingStatus.APPROVED } })).toBe(0);
    });
  });

  describe('AC-4: calendars', () => {
    it('US-54: a live hold is "Tentative" with its expiry; a pending request is "Pending"', async () => {
      const a = await seedEvent('A');
      const b = await seedEvent('B');
      const expiresAt = fromNow(48);
      const h = (await placeHold(holdBody(a.id, { expiresAt })).expect(201)).body;
      const pending = await seedBooking(b.id, BookingStatus.REQUESTED, at('09:00'), at('12:00'));

      const res = await http()
        .get(`/calendar?from=${at('00:00').toISOString()}&to=${at('00:00', '2030-10-03').toISOString()}`)
        .set('Authorization', as('staffA'))
        .expect(200);

      const byId = Object.fromEntries(res.body.entries.map((e: { id: string }) => [e.id, e]));
      expect(byId[h.id]).toMatchObject({ kind: 'TENTATIVE', holdExpiresAt: expiresAt.toISOString() });
      expect(byId[pending.id]).toMatchObject({ kind: 'PENDING', holdExpiresAt: null });

      const days = await http()
        .get(`/venues/${ids.hall}/availability?from=2030-10-01&to=2030-10-01`)
        .set('Authorization', as('coordinator'))
        .expect(200);
      expect(days.body[0].status).toBe('tentative');
    });
  });

  describe('AC-5: convert, extend, release', () => {
    it('US-54: convert makes it a confirmed booking, recorded as a decision', async () => {
      const event = await seedEvent();
      const h = (await placeHold(holdBody(event.id)).expect(201)).body;

      await hold(h.id, 'convert').expect(200);

      expect(await statusOf(h.id)).toBe(BookingStatus.APPROVED);
      const decisions = await prisma.bookingDecision.findMany({ where: { bookingId: h.id } });
      expect(decisions).toEqual([
        expect.objectContaining({
          kind: BookingDecisionKind.DECISION,
          outcome: BookingStatus.APPROVED,
          decidedById: ids.staffA,
          reason: 'Converted from hold',
        }),
      ]);
    });

    it('US-54: convert re-runs the approval checks — a block added since refuses it (409)', async () => {
      const event = await seedEvent();
      const h = (await placeHold(holdBody(event.id)).expect(201)).body;
      await prisma.venueBlock.create({
        data: { venueId: ids.hall, start: at('20:00'), end: at('21:00'), reason: 'Repairs', createdById: ids.staffA },
      });

      await hold(h.id, 'convert').expect(409);
      expect(await statusOf(h.id)).toBe(BookingStatus.HELD);
    });

    it('US-54: extend moves the expiry and resets the 24-hour warning', async () => {
      const event = await seedEvent();
      const h = (await placeHold(holdBody(event.id, { expiresAt: fromNow(2) })).expect(201)).body;
      await app.get(HoldExpiryScheduler).sendExpiryWarnings();
      expect((await prisma.venueBooking.findUniqueOrThrow({ where: { id: h.id } })).holdWarningSentAt).not.toBeNull();

      const later = fromNow(72);
      await hold(h.id, 'extend', { expiresAt: later }).expect(200);

      expect(await prisma.venueBooking.findUniqueOrThrow({ where: { id: h.id } })).toMatchObject({
        status: BookingStatus.HELD,
        holdExpiresAt: later,
        holdWarningSentAt: null,
      });
    });

    it('US-54: extend applies the same expiry rules (400)', async () => {
      const event = await seedEvent();
      const h = (await placeHold(holdBody(event.id)).expect(201)).body;

      await hold(h.id, 'extend', { expiresAt: fromNow(-1) }).expect(400);
      await hold(h.id, 'extend', { expiresAt: at('19:00') }).expect(400);
    });

    it('US-54: release frees the slot, with the reason recorded and the Coordinator told', async () => {
      const event = await seedEvent();
      const other = await seedEvent('Other');
      const h = (await placeHold(holdBody(event.id)).expect(201)).body;

      await hold(h.id, 'release').expect(200);

      expect(await prisma.venueBooking.findUniqueOrThrow({ where: { id: h.id } })).toMatchObject({
        status: BookingStatus.RELEASED,
        releaseReason: 'Released by venue staff',
      });
      expect(await recipients(NotificationType.HOLD_RELEASED)).toEqual([ids.coordinator]);
      await requestBooking(other.id).expect(201);
    });

    it.each(['convert', 'extend', 'release'] as const)(
      'US-54: %s is refused once the hold has expired (409)',
      async (action) => {
        const event = await seedEvent();
        const expired = await seedHold(event.id, fromNow(-1));

        await hold(expired.id, action, { expiresAt: fromNow(48) }).expect(409);
        expect(await statusOf(expired.id)).not.toBe(BookingStatus.APPROVED);
      },
    );

    it.each(['convert', 'extend', 'release'] as const)('US-54: %s is refused on a booking that is not a hold (409)', async (action) => {
      const event = await seedEvent();
      const booking = await seedBooking(event.id, BookingStatus.APPROVED);

      await hold(booking.id, action, { expiresAt: fromNow(48) }).expect(409);
    });

    it('US-54: only the venue manager can act on a hold (404)', async () => {
      const event = await seedEvent();
      const h = (await placeHold(holdBody(event.id)).expect(201)).body;

      await hold(h.id, 'release', {}, 'staffB').expect(404);
      expect(await statusOf(h.id)).toBe(BookingStatus.HELD);
    });
  });

  describe('AC-6/AC-7: the expiry job and notifications', () => {
    it('US-54: placing a hold notifies the event Coordinator', async () => {
      const event = await seedEvent();
      const h = (await placeHold(holdBody(event.id)).expect(201)).body;

      const [notice] = await notices(NotificationType.HOLD_PLACED);
      expect(notice).toMatchObject({ recipientId: ids.coordinator, relatedEventId: event.id, relatedBookingId: h.id });
      expect(notice.message).toContain('Main Hall');
      expect(notice.message).toContain('"Gala"');
      expect(await prisma.notification.count()).toBe(1);
    });

    it('US-54: an unassigned event notifies the Coordinator Leads instead', async () => {
      const event = await seedEvent('Unassigned', { coordinatorId: null });
      await placeHold(holdBody(event.id)).expect(201);

      expect(await recipients(NotificationType.HOLD_PLACED)).toEqual([ids.lead]);
    });

    it('US-54: expiry releases due holds once, however many times or instances run it', async () => {
      const event = await seedEvent();
      const due = await seedHold(event.id, fromNow(-1));
      const live = await seedHold(event.id, fromNow(48), at('09:00'), at('12:00'));
      const scheduler = app.get(HoldExpiryScheduler);

      await Promise.all([scheduler.expireDueHolds(), scheduler.expireDueHolds()]);
      await scheduler.expireDueHolds();

      expect(await statusOf(due.id)).toBe(BookingStatus.RELEASED);
      expect(await statusOf(live.id)).toBe(BookingStatus.HELD);
      // Week 7 #4 + US-40: the Coordinator and the venue manager, exactly once each.
      expect(await recipients(NotificationType.HOLD_EXPIRED)).toEqual([ids.coordinator, ids.staffA].sort());
    });

    it('US-54: the 24-hour warning is sent once, to the Coordinator and the venue manager', async () => {
      const event = await seedEvent();
      await placeHold(holdBody(event.id, { expiresAt: fromNow(20) })).expect(201);
      const other = await seedEvent('Later');
      await placeHold(holdBody(other.id, { start: at('09:00'), end: at('12:00'), expiresAt: fromNow(30) })).expect(201);
      const scheduler = app.get(HoldExpiryScheduler);

      await Promise.all([scheduler.sendExpiryWarnings(), scheduler.sendExpiryWarnings()]);
      await scheduler.sendExpiryWarnings();

      const warned = await notices(NotificationType.HOLD_EXPIRING);
      expect(warned.map((n) => n.recipientId).sort()).toEqual([ids.coordinator, ids.staffA].sort());
      expect(warned.every((n) => n.relatedEventId === event.id)).toBe(true);
    });
  });

  describe('the database backstop', () => {
    it('US-54: two overlapping HELD/APPROVED rows written directly are rejected (EXCLUDE, 23P01)', async () => {
      const a = await seedEvent('A');
      const b = await seedEvent('B');
      await seedBooking(a.id, BookingStatus.APPROVED);

      const error = await seedHold(b.id, fromNow(48), at('20:00'), at('23:00')).catch((e: Error) => e);

      expect(String(error)).toMatch(/23P01|VenueBooking_no_overlapping_committed/);
    });

    it('US-54: a constraint violation is reported as 409, not 500', async () => {
      const a = await seedEvent('A');
      const b = await seedEvent('B');
      const live = await seedHold(a.id, fromNow(48), at('09:00'), at('12:00'));
      const pending = await seedBooking(b.id, BookingStatus.REQUESTED, at('10:00'), at('11:00'));
      // Stub the app-level check so only the database stands in the way.
      jest.spyOn(app.get(BookingsService), 'conflictsFor').mockResolvedValue({
        hardConflicts: [],
        softConflicts: [],
        blocks: [],
        hasHardConflict: false,
      });

      await http().post(`/bookings/${pending.id}/approve`).set('Authorization', as('staffA')).send({}).expect(409);

      expect(await statusOf(pending.id)).toBe(BookingStatus.REQUESTED);
      expect(await statusOf(live.id)).toBe(BookingStatus.HELD);
    });
  });

  describe('US-38: an event with a live hold is rescheduled', () => {
    it('US-54: the hold is released, not moved, and the Coordinator is told', async () => {
      const event = await seedEvent();
      const h = (await placeHold(holdBody(event.id, { expiresAt: fromNow(48) })).expect(201)).body;

      const created = await http()
        .post(`/events/${event.id}/change-requests`)
        .set('Authorization', as('organiser'))
        .send({ reason: 'Moved', proposedStart: at('18:00', '2030-10-08'), proposedEnd: at('22:00', '2030-10-08') })
        .expect(201);
      await http()
        .post(`/events/change-requests/${created.body.id}/approve`)
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(await prisma.venueBooking.findUniqueOrThrow({ where: { id: h.id } })).toMatchObject({
        status: BookingStatus.RELEASED,
        releaseReason: 'Event rescheduled',
        start: at('18:00'),
      });
      expect(await recipients(NotificationType.HOLD_RELEASED)).toEqual([ids.coordinator]);
    });
  });
});
