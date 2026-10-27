import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BookingDecisionKind,
  BookingStatus,
  NotificationType,
  PrismaClient,
} from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { BookingsService } from '../src/bookings/bookings.service';
import { HoldExpiryScheduler } from '../src/bookings/hold-expiry.scheduler';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-54 e2e — tentative venue holds with expiry (Week 7 Customer Change #4).
 *
 * The expiry job is never started here (ScheduleModule does not run its
 * timers under test); tests call its two jobs directly, which is also how the
 * "correctness without the cron" cases prove they do not rely on it.
 *
 * Code under test: HoldsService (place, convert, extend, release, holdable
 * events), BookingsService.conflictsFor (live holds hard, REQUESTED soft,
 * expired holds ignored), HoldExpiryScheduler (expireDueHolds,
 * sendExpiryWarnings), the calendar and availability views, and the
 * VenueBooking_no_overlapping_committed EXCLUDE constraint.
 *
 * Pre-condition for every test: reset the testDB, then run base-users.sql,
 * tc-s1-25-setup.sql (Leah Lead, USR-012), tc-s1-96-setup.sql (Vince, USR-013)
 * and tc-s3-152-setup.sql (Main Hall, East Annex and the "Gala" EVT-276).
 * Expiry times in the hold scripts are relative to the database clock.
 */
describe('US-54 tentative venue holds (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  /** Fixed rows from base-users, tc-s1-25-setup, tc-s1-96-setup and tc-s3-152 to 158. */
  const ids: Record<string, string> = {
    staffA: 'USR-010',
    staffB: 'USR-013',
    organiser: 'USR-006',
    coordinator: 'USR-004',
    lead: 'USR-012',
    hall: 'VEN-079',
    annex: 'VEN-080',
  };
  const LOGINS: Record<string, string> = {
    staffA: 'venue.staff@example.com',
    staffB: 'venue.staff2@example.com',
    organiser: 'organiser@example.com',
    coordinator: 'coord.a@example.com',
    lead: 'lead@example.com',
  };
  /** Events: tc-s3-152 (Gala), 152b (Draft), 153 (Submitted), 154 (Other), 158 (Unassigned). */
  const gala = { id: 'EVT-276' };
  const other = { id: 'EVT-279' };

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const at = (time: string, day = '2030-10-01') => new Date(`${day}T${time}:00Z`);
  const fromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000);

  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  /** Only the database backstop writes a hold directly: that write is the act under test. */
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
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    prisma = new PrismaClient();

    // Users keep their fixed IDs after every reset, so these tokens stay valid.
    await resetDb(prisma);
    await given('base-users', 'tc-s1-25-setup', 'tc-s1-96-setup');
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
    jest.restoreAllMocks();
    await resetDb(prisma);
    await given('base-users', 'tc-s1-25-setup', 'tc-s1-96-setup', 'tc-s3-152-setup');
  });

  describe('AC-1: placing a hold', () => {
    // TC-S3-152 · US-54 AC-1 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup · fails if Venue Staff cannot hold a free slot for an event with an expiry, or the hold or the event picker is wrong
    // Code: POST /venues/:venueId/holds -> HoldsService.place; GET /venues/:venueId/holdable-events -> HoldsService.holdableEvents
    it('US-54: Venue Staff hold a free slot for an event, with an expiry', async () => {
      const event = gala;
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

    // TC-S3-152 · US-54 AC-1 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup + tc-s3-152c-setup · fails if Venue Staff cannot hold a free slot for an event with an expiry, or the hold or the event picker is wrong
    // Code: POST /venues/:venueId/holds -> HoldsService.place; GET /venues/:venueId/holdable-events -> HoldsService.holdableEvents
    it('Story 20 AC-2: a hold carries the technical requirements, as a request does', async () => {
      await given('tc-s3-152c-setup');
      const event = gala;

      const res = await placeHold(holdBody(event.id)).expect(201);

      expect(res.body).toMatchObject({
        technicalSupportNeeds: 'Lighting technician',
        requiredFacilities: ['STAGE'],
        equipmentRequirements: [{ equipmentType: 'Spotlight', quantity: 2, notes: null }],
      });
    });

    // TC-S3-152 · US-54 AC-1 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup + tc-s3-152b-setup · fails if Venue Staff cannot hold a free slot for an event with an expiry, or the hold or the event picker is wrong
    // Code: POST /venues/:venueId/holds -> HoldsService.place; GET /venues/:venueId/holdable-events -> HoldsService.holdableEvents
    it('US-54: lists the bookable events to hold for, with only the fields the picker needs', async () => {
      await given('tc-s3-152b-setup');

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
          coordinator: { id: ids.coordinator, name: 'Cody Coordinator' },
        },
      ]);
      await http().get(`/venues/${ids.hall}/holdable-events`).set('Authorization', as('staffB')).expect(404);
    });
  });

  describe('AC-2 and access: validation', () => {
    // TC-S3-153 · US-54 AC-2 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup · fails if a hold is accepted with an expiry in the past or after the slot or event starts, by the wrong user, or for an event not in planning
    // Code: HoldExpiryDto (@MinDate now) + holds.service assertExpiry; HoldsService.findManagedVenue; planning statuses only
    it('US-54: an expiry in the past is refused (400)', async () => {
      const event = gala;
      await placeHold(holdBody(event.id, { expiresAt: fromNow(-1) })).expect(400);
    });

    // TC-S3-153 · US-54 AC-2 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup · fails if a hold is accepted with an expiry in the past or after the slot or event starts, by the wrong user, or for an event not in planning
    // Code: HoldExpiryDto (@MinDate now) + holds.service assertExpiry; HoldsService.findManagedVenue; planning statuses only
    it('US-54: an expiry at or after the event starts is refused (400)', async () => {
      const event = gala;
      await placeHold(holdBody(event.id, { expiresAt: at('18:00') })).expect(400);
      await placeHold(holdBody(event.id, { expiresAt: at('19:00') })).expect(400);
    });

    // TC-S3-153 · US-54 AC-2 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup · fails if a hold is accepted with an expiry in the past or after the slot or event starts, by the wrong user, or for an event not in planning
    // Code: HoldExpiryDto (@MinDate now) + holds.service assertExpiry; HoldsService.findManagedVenue; planning statuses only
    it('US-54: an expiry after the held slot starts is refused, even before the event (400)', async () => {
      const event = gala;
      await placeHold(
        holdBody(event.id, { start: at('09:00', '2030-09-30'), end: at('12:00', '2030-09-30'), expiresAt: at('10:00', '2030-09-30') }),
      ).expect(400);
    });

    // TC-S3-153 · US-54 AC-2 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup · fails if a hold is accepted with an expiry in the past or after the slot or event starts, by the wrong user, or for an event not in planning
    // Code: HoldExpiryDto (@MinDate now) + holds.service assertExpiry; HoldsService.findManagedVenue; planning statuses only
    it('US-54: other roles are refused (403); Venue Staff who do not manage the venue get not found (404)', async () => {
      const event = gala;
      await placeHold(holdBody(event.id), 'coordinator').expect(403);
      await placeHold(holdBody(event.id), 'staffB').expect(404);
      expect(await prisma.venueBooking.count()).toBe(0);
    });

    // TC-S3-152 · US-54 AC-1 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup + tc-s3-152d-setup · fails if a draft venue can be held, or an unknown event is not refused
    // Code: HoldsService.place (venue PUBLISHED, event found)
    it('US-54: a draft venue cannot be held (409), nor an event that does not exist (404)', async () => {
      await placeHold(holdBody('EVT-999')).expect(404);
      await given('tc-s3-152d-setup');

      await placeHold(holdBody(gala.id)).expect(409);
      expect(await prisma.venueBooking.count()).toBe(0);
    });

    // TC-S3-153 · US-54 AC-2 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup + tc-s3-153-setup · fails if a hold is accepted with an expiry in the past or after the slot or event starts, by the wrong user, or for an event not in planning
    // Code: HoldExpiryDto (@MinDate now) + holds.service assertExpiry; HoldsService.findManagedVenue; planning statuses only
    it('US-54: an event that is not at a planning stage cannot be held for (409)', async () => {
      await given('tc-s3-153-setup');
      const event = { id: 'EVT-278' };
      await placeHold(holdBody(event.id)).expect(409);
    });
  });

  describe('AC-3: a live hold hard-blocks; REQUESTED stays soft', () => {
    // TC-S3-154 · US-54 AC-3 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup + tc-s3-154-setup · fails if a live hold does not block other requests and holds like a confirmed booking, or a pending request blocks a hold
    // Code: BookingsService.conflictsFor (HELD hard, REQUESTED soft)
    it('US-54: a booking request overlapping a live hold is refused (409)', async () => {
      const held = gala;
      await given('tc-s3-154-setup');
      const h = (await placeHold(holdBody(held.id)).expect(201)).body;

      const res = await requestBooking(other.id, at('20:00'), at('23:00')).expect(409);

      expect(res.body.conflicts).toEqual([
        expect.objectContaining({ kind: 'BOOKING', bookingId: h.id, status: BookingStatus.HELD }),
      ]);
    });

    // TC-S3-154 · US-54 AC-3 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup + tc-s3-154-setup · fails if a live hold does not block other requests and holds like a confirmed booking, or a pending request blocks a hold
    // Code: BookingsService.conflictsFor (HELD hard, REQUESTED soft)
    it('US-54: a hold overlapping a live hold is refused (409)', async () => {
      const a = gala;
      const b = other;
      await given('tc-s3-154-setup');
      await placeHold(holdBody(a.id)).expect(201);

      await placeHold(holdBody(b.id, { start: at('21:00'), end: at('23:00') })).expect(409);
    });

    // TC-S3-154 · US-54 AC-3 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup + tc-s3-154-setup + tc-s3-154b-setup · fails if a live hold does not block other requests and holds like a confirmed booking, or a pending request blocks a hold
    // Code: BookingsService.conflictsFor (HELD hard, REQUESTED soft)
    it('US-54: a hold overlapping an APPROVED booking is refused (409)', async () => {
      const b = other;
      await given('tc-s3-154-setup');
      await given('tc-s3-154b-setup');

      await placeHold(holdBody(b.id)).expect(409);
    });

    // TC-S3-154 · US-54 AC-3 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup + tc-s3-154-setup + tc-s3-154c-setup · fails if a live hold does not block other requests and holds like a confirmed booking, or a pending request blocks a hold
    // Code: BookingsService.conflictsFor (HELD hard, REQUESTED soft)
    it('US-54: a hold overlapping a pending request goes through with a soft warning', async () => {
      const b = other;
      await given('tc-s3-154-setup');
      await given('tc-s3-154c-setup');
      const pending = { id: 'BKG-155' };

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
    // TC-S3-157 · US-54 AC-6 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup + tc-s3-154-setup + tc-s3-157-setup · fails if an expired hold still blocks the slot or shows as held before the expiry job runs
    // Code: BookingsService.conflictsFor (live holds only); calendar, availability and search ignore expired holds
    it('US-54: an expired, unreleased hold does not block a request, and approving it succeeds despite the DB constraint', async () => {
      await given('tc-s3-154-setup', 'tc-s3-157-setup');
      const expired = { id: 'BKG-157' };

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

    // TC-S3-157 · US-54 AC-6 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup + tc-s3-157-setup · fails if an expired hold still blocks the slot or shows as held before the expiry job runs
    // Code: BookingsService.conflictsFor (live holds only); calendar, availability and search ignore expired holds
    it('US-54: an expired hold never shows as held or confirmed — calendar, availability and search', async () => {
      await given('tc-s3-157-setup');

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
    // TC-S3-155 · US-54 AC-4 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup + tc-s3-154-setup + tc-s3-155-setup · fails if a live hold is not shown as Tentative with its expiry
    // Code: GET /calendar (kind TENTATIVE, holdExpiresAt); venue availability 'tentative'
    it('US-54: a live hold is "Tentative" with its expiry; a pending request is "Pending"', async () => {
      const a = gala;
      await given('tc-s3-154-setup');
      const expiresAt = fromNow(48);
      const h = (await placeHold(holdBody(a.id, { expiresAt })).expect(201)).body;
      await given('tc-s3-155-setup');
      const pending = { id: 'BKG-156' };

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
    // TC-S3-156 · US-54 AC-5 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup · fails if a hold cannot be converted, extended or released before expiry, or can be after expiry, by the wrong user, or on a non-hold
    // Code: POST /bookings/:id/hold/(convert|extend|release) -> HoldsService.convert | extend | release (lockAndReadLive, findManagedHold)
    it('US-54: convert makes it a confirmed booking, recorded as a decision', async () => {
      const event = gala;
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

    // TC-S3-156 · US-54 AC-5 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup · fails if a hold cannot be converted, extended or released before expiry, or can be after expiry, by the wrong user, or on a non-hold
    // Code: POST /bookings/:id/hold/(convert|extend|release) -> HoldsService.convert | extend | release (lockAndReadLive, findManagedHold)
    it('US-54: convert re-runs the approval checks — a block added since refuses it (409)', async () => {
      const event = gala;
      const h = (await placeHold(holdBody(event.id)).expect(201)).body;
      await prisma.venueBlock.create({
        data: { venueId: ids.hall, start: at('20:00'), end: at('21:00'), reason: 'Repairs', createdById: ids.staffA },
      });

      await hold(h.id, 'convert').expect(409);
      expect(await statusOf(h.id)).toBe(BookingStatus.HELD);
    });

    // TC-S3-156 · US-54 AC-5 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup · fails if a hold cannot be converted, extended or released before expiry, or can be after expiry, by the wrong user, or on a non-hold
    // Code: POST /bookings/:id/hold/(convert|extend|release) -> HoldsService.convert | extend | release (lockAndReadLive, findManagedHold)
    it('US-54: extend moves the expiry and resets the 24-hour warning', async () => {
      const event = gala;
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

    // TC-S3-156 · US-54 AC-5 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup · fails if a hold cannot be converted, extended or released before expiry, or can be after expiry, by the wrong user, or on a non-hold
    // Code: POST /bookings/:id/hold/(convert|extend|release) -> HoldsService.convert | extend | release (lockAndReadLive, findManagedHold)
    it('US-54: extend applies the same expiry rules (400)', async () => {
      const event = gala;
      const h = (await placeHold(holdBody(event.id)).expect(201)).body;

      await hold(h.id, 'extend', { expiresAt: fromNow(-1) }).expect(400);
      await hold(h.id, 'extend', { expiresAt: at('19:00') }).expect(400);
    });

    // TC-S3-156 · US-54 AC-5 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup + tc-s3-154-setup · fails if a hold cannot be converted, extended or released before expiry, or can be after expiry, by the wrong user, or on a non-hold
    // Code: POST /bookings/:id/hold/(convert|extend|release) -> HoldsService.convert | extend | release (lockAndReadLive, findManagedHold)
    it('US-54: release frees the slot, with the reason recorded and the Coordinator told', async () => {
      const event = gala;
      await given('tc-s3-154-setup');
      const h = (await placeHold(holdBody(event.id)).expect(201)).body;

      await hold(h.id, 'release').expect(200);

      expect(await prisma.venueBooking.findUniqueOrThrow({ where: { id: h.id } })).toMatchObject({
        status: BookingStatus.RELEASED,
        releaseReason: 'Released by venue staff',
      });
      expect(await recipients(NotificationType.HOLD_RELEASED)).toEqual([ids.coordinator]);
      await requestBooking(other.id).expect(201);
    });

    // TC-S3-156 · US-54 AC-5 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup + tc-s3-157-setup · fails if a hold cannot be converted, extended or released before expiry, or can be after expiry, by the wrong user, or on a non-hold
    // Code: POST /bookings/:id/hold/(convert|extend|release) -> HoldsService.convert | extend | release (lockAndReadLive, findManagedHold)
    it.each(['convert', 'extend', 'release'] as const)(
      'US-54: %s is refused once the hold has expired (409)',
      async (action) => {
        await given('tc-s3-157-setup');
        const expired = { id: 'BKG-157' };

        await hold(expired.id, action, { expiresAt: fromNow(48) }).expect(409);
        expect(await statusOf(expired.id)).not.toBe(BookingStatus.APPROVED);
      },
    );

    // TC-S3-156 · US-54 AC-5 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup + tc-s3-154b-setup · fails if a hold cannot be converted, extended or released before expiry, or can be after expiry, by the wrong user, or on a non-hold
    // Code: POST /bookings/:id/hold/(convert|extend|release) -> HoldsService.convert | extend | release (lockAndReadLive, findManagedHold)
    it.each(['convert', 'extend', 'release'] as const)('US-54: %s is refused on a booking that is not a hold (409)', async (action) => {
      await given('tc-s3-154b-setup');
      const booking = { id: 'BKG-154' };

      await hold(booking.id, action, { expiresAt: fromNow(48) }).expect(409);
    });

    // TC-S3-156 · US-54 AC-5 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup · fails if a hold cannot be converted, extended or released before expiry, or can be after expiry, by the wrong user, or on a non-hold
    // Code: POST /bookings/:id/hold/(convert|extend|release) -> HoldsService.convert | extend | release (lockAndReadLive, findManagedHold)
    it('US-54: only the venue manager can act on a hold (404)', async () => {
      const event = gala;
      const h = (await placeHold(holdBody(event.id)).expect(201)).body;

      await hold(h.id, 'release', {}, 'staffB').expect(404);
      expect(await statusOf(h.id)).toBe(BookingStatus.HELD);
    });
  });

  describe('AC-6/AC-7: the expiry job and notifications', () => {
    // TC-S3-158 · US-54 AC-7 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup · fails if the Coordinator is not told when a hold is placed, or someone else is
    // Code: HoldsService.place -> HoldNotifier (HOLD_PLACED)
    it('US-54: placing a hold notifies the event Coordinator', async () => {
      const event = gala;
      const h = (await placeHold(holdBody(event.id)).expect(201)).body;

      const [notice] = await notices(NotificationType.HOLD_PLACED);
      expect(notice).toMatchObject({ recipientId: ids.coordinator, relatedEventId: event.id, relatedBookingId: h.id });
      // Venue and event come from relatedBookingId / relatedEventId; the message says when.
      expect(notice.message).toMatch(/^Held for .* UTC until .* UTC\.$/);
      expect(await prisma.notification.count()).toBe(1);
    });

    // TC-S3-158 · US-54 AC-7 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup + tc-s3-158-setup · fails if an event with no Coordinator notifies no one, or not the Coordinator Leads
    // Code: HoldsService.place -> HoldNotifier (HOLD_PLACED; the Leads when unassigned)
    it('US-54: an unassigned event notifies the Coordinator Leads instead', async () => {
      await given('tc-s3-158-setup');
      const event = { id: 'EVT-280' };
      await placeHold(holdBody(event.id)).expect(201);

      expect(await recipients(NotificationType.HOLD_PLACED)).toEqual([ids.lead]);
    });

    // TC-S3-157 · US-54 AC-6 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup + tc-s3-157-setup + tc-s3-157b-setup · fails if a due hold is not released, a live one is, or a repeated or concurrent run releases or notifies twice
    // Code: HoldExpiryScheduler.expireDueHolds
    it('US-54: expiry releases due holds once, however many times or instances run it', async () => {
      await given('tc-s3-157-setup', 'tc-s3-157b-setup');
      const due = { id: 'BKG-157' };
      const live = { id: 'BKG-158' };
      const scheduler = app.get(HoldExpiryScheduler);

      await Promise.all([scheduler.expireDueHolds(), scheduler.expireDueHolds()]);
      await scheduler.expireDueHolds();

      expect(await statusOf(due.id)).toBe(BookingStatus.RELEASED);
      expect(await statusOf(live.id)).toBe(BookingStatus.HELD);
      // Week 7 #4 + US-40: the Coordinator and the venue manager, exactly once each.
      expect(await recipients(NotificationType.HOLD_EXPIRED)).toEqual([ids.coordinator, ids.staffA].sort());
    });

    // TC-S3-158 · US-54 AC-7 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup + tc-s3-154-setup · fails if the 24-hour warning is missing, sent twice, sent for a hold not yet due, or sent to the wrong people
    // Code: HoldExpiryScheduler.sendExpiryWarnings
    it('US-54: the 24-hour warning is sent once, to the Coordinator and the venue manager', async () => {
      const event = gala;
      await placeHold(holdBody(event.id, { expiresAt: fromNow(20) })).expect(201);
      await given('tc-s3-154-setup');
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
    // TC-S3-154 · US-54 AC-3 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup + tc-s3-154-setup + tc-s3-154b-setup · fails if two overlapping held or approved rows can both be saved, or the clash is reported as 500
    // Code: VenueBooking_no_overlapping_committed EXCLUDE; isExclusionViolation maps 23P01 to 409
    it('US-54: two overlapping HELD/APPROVED rows written directly are rejected (EXCLUDE, 23P01)', async () => {
      const b = other;
      await given('tc-s3-154-setup');
      await given('tc-s3-154b-setup');

      const error = await seedHold(b.id, fromNow(48), at('20:00'), at('23:00')).catch((e: Error) => e);

      expect(String(error)).toMatch(/23P01|VenueBooking_no_overlapping_committed/);
    });

    // TC-S3-154 · US-54 AC-3 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup + tc-s3-154-setup + tc-s3-157b-setup + tc-s3-157c-setup · fails if two overlapping held or approved rows can both be saved, or the clash is reported as 500
    // Code: VenueBooking_no_overlapping_committed EXCLUDE; isExclusionViolation maps 23P01 to 409
    it('US-54: a constraint violation is reported as 409, not 500', async () => {
      await given('tc-s3-154-setup', 'tc-s3-157b-setup', 'tc-s3-157c-setup');
      const live = { id: 'BKG-158' };
      const pending = { id: 'BKG-159' };
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
    // TC-S3-156 · US-54 AC-5 · setup: base-users + tc-s1-25-setup + tc-s1-96-setup + tc-s3-152-setup · fails if a hold is moved with a rescheduled event instead of being released, or the Coordinator is not told
    // Code: BookingsService.rebookForEventChange -> releaseHold (HOLD_RELEASED_BY_RESCHEDULE)
    it('US-54: the hold is released, not moved, and the Coordinator is told', async () => {
      const event = gala;
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
