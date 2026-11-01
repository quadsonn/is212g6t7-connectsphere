import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * Story 16 — Venue Availability Calendar. Integration tests,
 * one describe per acceptance criterion.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql and base-venues.sql; each test then loads
 * the tc-s2 script(s) its test case names (docs/testing/sprint2-test-cases.md).
 */
describe('Story 16 venue availability calendar (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';

  /** Fixed users: base-users.sql, plus USR-011 from tc-s2-01-setup.sql. */
  const USERS = {
    staff: 'venue.staff@example.com',
    staffB: 'venue.staff.b@example.com',
    coordinator: 'coord.a@example.com',
  } as const;
  const tokens: Record<string, string> = {};

  /** Fixed venues: base-venues.sql, plus VEN-003 from tc-s2-01-setup.sql. */
  const VENUE = {
    hall: 'VEN-002',
    room: 'VEN-038',
    other: 'VEN-003',
  } as const;

  const as = (who: keyof typeof USERS) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const at = (day: number, hour: number) =>
    `2030-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`;
  const week = { from: at(1, 0), to: at(8, 0) };
  const calendar = (query: Record<string, string> = {}, who: keyof typeof USERS = 'staff') =>
    http().get('/calendar').query({ ...week, ...query }).set('Authorization', as(who));
  const block = (body: Record<string, string>, who: keyof typeof USERS = 'staff') =>
    http().post('/calendar/blocks').set('Authorization', as(who)).send(body);

  /** Loads a test case's setup script(s) on top of base-users and base-venues. */
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    // 127.0.0.1 explicitly, as in the converted Sprint 1 specs: avoids the
    // intermittent "socket hang up" seen with init() alone.
    await app.listen(0, '127.0.0.1');

    prisma = new PrismaClient();

    // Log each user in once. IDs are fixed, so the tokens stay valid after
    // every reset.
    await resetDb(prisma);
    await given('base-users', 'tc-s2-01-setup');
    for (const [key, email] of Object.entries(USERS)) {
      const res = await http().post('/auth/login').send({ email, password: PASSWORD }).expect(200);
      tokens[key] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    // Leave the testDB empty, so files not yet converted to resetDb (which
    // delete only the tables they know) never trip over rows this file made.
    await resetDb(prisma);
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await given('base-users', 'base-venues');
  });

  describe('AC-1: my venues, slots distinguished by status', () => {
    // TC-S2-01 · US-16 AC-1 · setup: base-users + base-venues + tc-s2-01-setup · fails if a draft or another staff member's venue appeared on my calendar
    // Code: GET /calendar -> CalendarService.getCalendar() reads venues where managedById = the
    // caller and status PUBLISHED.
    it('lists only the published venues I manage', async () => {
      await given('tc-s2-01-setup');

      const res = await calendar().expect(200);

      expect(res.body.venues.map((v: { name: string }) => v.name)).toEqual([
        'Main Hall',
        'Rooftop Terrace',
        'Seminar Room',
      ]);
    });

    // TC-S2-02 · US-16 AC-1 · setup: base-users + base-venues + tc-s2-01-setup + tc-s2-02-setup · fails if a status were mislabelled, a rejected request shown, or another staff member's booking leaked in
    // Code: kindOf() maps REQUESTED -> PENDING, APPROVED -> CONFIRMED and a live HELD -> TENTATIVE
    // (US-54); VenueBlock rows are BLOCKED; liveBookingsWhere() leaves REJECTED out; entries are
    // sorted by start.
    it('marks pending as pending, approved as confirmed and blocks as blocked', async () => {
      await given('tc-s2-01-setup', 'tc-s2-02-setup');

      const res = await calendar().expect(200);

      expect(
        res.body.entries.map((e: { kind: string; eventName: string | null; reason: string | null }) => [
          e.kind,
          e.eventName ?? e.reason,
        ]),
      ).toEqual([
        // US-54: TENTATIVE now means a live hold; a pending request is PENDING.
        ['PENDING', 'Pending talk'],
        ['CONFIRMED', 'Confirmed gala'],
        ['BLOCKED', 'Holiday'],
      ]);
    });

    // TC-S2-03 · US-16 access · setup: base-users + base-venues · fails if a role other than Venue Staff could read the calendar
    // Code: GET /calendar is @RequirePermission(BOOKING, DECIDE), which only Venue Staff hold.
    it('is denied to a Coordinator (403)', async () => {
      await calendar({}, 'coordinator').expect(403);
    });
  });

  describe('AC-2: day/week/month windows', () => {
    // TC-S2-04 · US-16 AC-2 · setup: base-users + base-venues + tc-s2-04-setup · fails if the week window included a booking from outside it
    // Code: CalendarQueryDto requires from and to; getCalendar() keeps entries that overlap them
    // (overlapsRange).
    it('only returns entries in the requested window', async () => {
      await given('tc-s2-04-setup');

      const res = await calendar().expect(200);

      expect(res.body.entries.map((e: { eventName: string }) => e.eventName)).toEqual(['Day two']);
    });

    // TC-S2-04 · US-16 AC-2 · setup: base-users + base-venues + tc-s2-04-setup · fails if the server refused the one-day or six-week window the Day and Month views request
    // Code: the frontend's Day, Week and Month views each send a from/to window within the 42-day
    // limit (MAX_CALENDAR_DAYS).
    it('accepts the exact windows the Day, Week and Month views ask for', async () => {
      await given('tc-s2-04-setup');

      // Day: one day. Month: padded to whole weeks, up to 42 days.
      const day = await calendar({ from: at(2, 0), to: at(3, 0) }).expect(200);
      const month = await calendar({ from: at(1, 0), to: '2030-11-12T00:00:00.000Z' }).expect(200);

      expect(day.body.entries.map((e: { eventName: string }) => e.eventName)).toEqual(['Day two']);
      expect(month.body.entries.map((e: { eventName: string }) => e.eventName)).toEqual([
        'Day two',
        'Next week',
      ]);
    });

    // TC-S2-04 · US-16 AC-2 · setup: base-users + base-venues + tc-s2-04-setup · fails if a day view showed a booking from a different day
    // Code: overlapsRange() is strict (start < to, end > from), so an entry ending at midnight is
    // not on the next day.
    it('excludes an entry from a day it does not touch', async () => {
      await given('tc-s2-04-setup');

      const res = await calendar({ from: at(3, 0), to: at(4, 0) }).expect(200);

      expect(res.body.entries).toEqual([]);
    });

    // TC-S2-04 · US-16 AC-2 · setup: base-users + base-venues · fails if an oversized or backwards window were accepted
    // Code: CalendarQueryDto: to is @IsAfterField('from'); getCalendar() refuses a range over
    // MAX_CALENDAR_DAYS (42) with 400.
    it('rejects a window over six weeks, or one that ends before it starts (400)', async () => {
      await calendar({ to: '2030-12-31T00:00:00.000Z' }).expect(400);
      await calendar({ to: at(1, 0), from: at(5, 0) }).expect(400);
    });
  });

  describe('AC-3: filter to one venue', () => {
    // TC-S2-05 · US-16 AC-3 · setup: base-users + base-venues + tc-s2-01-setup + tc-s2-05-setup · fails if the venue filter let another venue's bookings through
    // Code: venueId in CalendarQueryDto adds { id: venueId } to the managed-venues filter.
    it('narrows the venues and entries to the chosen venue', async () => {
      await given('tc-s2-01-setup', 'tc-s2-05-setup');

      const res = await calendar({ venueId: VENUE.room }).expect(200);

      expect(res.body.venues.map((v: { id: string }) => v.id)).toEqual([VENUE.room]);
      expect(res.body.entries.map((e: { eventName: string }) => e.eventName)).toEqual(['Room event']);
    });

    // TC-S2-05 · US-16 AC-3 · setup: base-users + base-venues + tc-s2-01-setup + tc-s2-05-setup · fails if filtering by another staff member's venue exposed its bookings
    // Code: the venueId filter is combined with managedById = the caller, so another manager's venue
    // matches nothing.
    it('returns nothing for a venue I do not manage', async () => {
      await given('tc-s2-01-setup', 'tc-s2-05-setup');

      const res = await calendar({ venueId: VENUE.other }).expect(200);

      expect(res.body).toEqual({ venues: [], entries: [] });
    });
  });

  describe('AC-4: a booked slot carries its details', () => {
    // TC-S2-06 · US-16 AC-4 · setup: base-users + base-venues + tc-s2-06-setup · fails if a slot lacked its event name, organiser, time or attendance
    // Code: each booking entry carries eventName, organiserName, start, end and expectedAttendance
    // from the booking and its event.
    it('includes event name, organiser, time and attendance', async () => {
      await given('tc-s2-06-setup');

      const [entry] = (await calendar().expect(200)).body.entries;

      expect(entry).toMatchObject({
        id: 'BKG-010',
        eventName: 'Gala',
        organiserName: 'Olivia Organiser',
        start: at(2, 9),
        end: at(2, 12),
        expectedAttendance: 80,
      });
    });

    // TC-S2-06 · US-16 AC-4 · setup: base-users + base-venues + tc-s2-06-setup · fails if the id a calendar slot carries did not open that booking
    // Code: an entry's id is the booking id; GET /bookings/:id returns the full booking with its
    // event and organiser.
    it('opens the full booking for that slot (the click-through)', async () => {
      // The UI loads the booking by the id the calendar entry carries.
      await given('tc-s2-06-setup');
      const [entry] = (await calendar().expect(200)).body.entries;

      const res = await http().get(`/bookings/${entry.id}`).set('Authorization', as('staff')).expect(200);

      expect(res.body).toMatchObject({
        id: 'BKG-010',
        expectedAttendance: 80,
        event: { name: 'Gala', organiser: { name: 'Olivia Organiser' } },
        venue: { id: VENUE.hall },
      });
    });
  });

  describe('AC-5: reflects changes on refresh', () => {
    // TC-S2-07 · US-16 AC-5 · setup: base-users + base-venues + tc-s2-07-setup · fails if an approval did not show as confirmed on the next read, or the response could be cached
    // Code: getCalendar() reads the database on every call; Cache-Control: no-store stops a cached
    // copy.
    it('shows a booking as confirmed on the next read after it is approved', async () => {
      await given('tc-s2-07-setup');
      expect((await calendar().expect(200)).body.entries[0].kind).toBe('PENDING');

      await http().post('/bookings/BKG-011/approve').set('Authorization', as('staff')).send({}).expect(200);

      const res = await calendar().expect(200);
      expect(res.body.entries[0].kind).toBe('CONFIRMED');
      expect(res.headers['cache-control']).toBe('no-store');
    });

    // TC-S2-07 · US-16 AC-5 · setup: base-users + base-venues + tc-s2-07-setup · fails if a withdrawn (reversed) booking still occupied the calendar
    // Code: a reversed booking leaves the live statuses getCalendar() reads.
    it('drops a booking from the calendar on the next read after it is cancelled', async () => {
      // A reversal to rejected is how a confirmed booking is withdrawn (Story 22 AC-6).
      await given('tc-s2-07-setup');
      await http().post('/bookings/BKG-011/approve').set('Authorization', as('staff')).send({}).expect(200);
      expect((await calendar().expect(200)).body.entries).toHaveLength(1);

      await http()
        .post('/bookings/BKG-011/reverse')
        .set('Authorization', as('staff'))
        .send({ reason: 'Event called off' })
        .expect(200);

      expect((await calendar().expect(200)).body.entries).toEqual([]);
    });

    // TC-S2-07 · US-16 AC-5 · setup: base-users + base-venues + tc-s2-07-setup · fails if a rejected request lingered as tentatively held
    // Code: liveBookingsWhere() leaves REJECTED bookings off the calendar.
    it('shows a rejected request as gone, not tentative', async () => {
      await given('tc-s2-07-setup');

      await http()
        .post('/bookings/BKG-011/reject')
        .set('Authorization', as('staff'))
        .send({ reason: 'Venue unavailable' })
        .expect(200);

      expect((await calendar().expect(200)).body.entries).toEqual([]);
    });
  });

  describe('AC-6: blocked-out periods', () => {
    // TC-S2-08 · US-16 AC-6 · setup: base-users + base-venues · fails if a new block did not appear as BLOCKED with its reason and author
    // Code: POST /calendar/blocks -> createBlock() stores a VenueBlock; the calendar shows it as
    // BLOCKED with its reason and who set it.
    it('blocks out time, which then appears as BLOCKED', async () => {
      await block({ venueId: VENUE.hall, start: at(3, 0), end: at(4, 0), reason: 'Maintenance' }).expect(201);

      const [entry] = (await calendar().expect(200)).body.entries;
      expect(entry).toMatchObject({ kind: 'BLOCKED', reason: 'Maintenance', createdByName: 'Vera Venue' });
    });

    // TC-S2-08 · US-16 AC-6 · setup: base-users + base-venues · fails if a block without a reason, or ending before it starts, were saved
    // Code: CreateVenueBlockDto: reason @IsNotEmpty, end @IsAfterField('start').
    it('requires a reason and an end after the start (400)', async () => {
      await block({ venueId: VENUE.hall, start: at(3, 0), end: at(4, 0), reason: '' }).expect(400);
      await block({ venueId: VENUE.hall, start: at(4, 0), end: at(3, 0), reason: 'x' }).expect(400);
    });

    // TC-S2-08 · US-16 AC-6 · setup: base-users + base-venues + tc-s2-01-setup · fails if staff could block another's venue, or a Coordinator could block at all
    // Code: createBlock() finds the venue with managedById = the caller (404 otherwise); the route
    // needs VENUE/UPDATE (403 for a Coordinator).
    it('refuses a venue I do not manage (404) and a Coordinator (403)', async () => {
      await given('tc-s2-01-setup');

      await block({ venueId: VENUE.other, start: at(3, 0), end: at(4, 0), reason: 'x' }).expect(404);
      await block({ venueId: VENUE.hall, start: at(3, 0), end: at(4, 0), reason: 'x' }, 'coordinator').expect(403);
    });

    // TC-S2-08 · US-16 AC-6 · setup: base-users + base-venues + tc-s2-01-setup · fails if a block could not be removed by its manager, or could be by someone else
    // Code: DELETE /calendar/blocks/:id -> removeBlock() matches the block's venue to the caller
    // (404 for another manager), then deletes it (204).
    it('removes a block', async () => {
      await given('tc-s2-01-setup');
      const created = await block({ venueId: VENUE.hall, start: at(3, 0), end: at(4, 0), reason: 'Maintenance' }).expect(201);

      await http().delete(`/calendar/blocks/${created.body.id}`).set('Authorization', as('staffB')).expect(404);
      await http().delete(`/calendar/blocks/${created.body.id}`).set('Authorization', as('staff')).expect(204);
      expect((await calendar().expect(200)).body.entries).toEqual([]);
    });

    // TC-S2-09 · US-16 AC-6 · setup: base-users + base-venues + tc-s2-09-setup · fails if blocking time over a confirmed booking did not report that booking
    // Code: createBlock() returns overlappingBookings: live bookings the new block covers, so staff
    // can follow them up.
    it('reports existing bookings inside the new block', async () => {
      await given('tc-s2-09-setup');

      const res = await block({ venueId: VENUE.hall, start: at(2, 0), end: at(3, 0), reason: 'Leak' }).expect(201);

      expect(res.body.overlappingBookings).toEqual(
        expect.arrayContaining([expect.objectContaining({ bookingId: 'BKG-012' })]),
      );
    });

    // TC-S2-09 · US-16 AC-6 · setup: base-users + base-venues + tc-s2-09-setup · fails if a request or an approval could land inside a blocked period
    // Code: booking requests and approvals check VenueBlock rows as conflicts (kind BLOCK): 409.
    it('stops a Coordinator requesting, and staff approving, inside a block', async () => {
      await given('tc-s2-09-setup');
      await block({ venueId: VENUE.hall, start: at(2, 0), end: at(3, 0), reason: 'Maintenance' }).expect(201);

      const approve = await http()
        .post('/bookings/BKG-013/approve')
        .set('Authorization', as('staff'))
        .send({})
        .expect(409);
      expect(approve.body.conflicts).toEqual([expect.objectContaining({ kind: 'BLOCK', reason: 'Maintenance' })]);

      await http()
        .post('/bookings')
        .set('Authorization', as('coordinator'))
        .send({ eventId: 'EVT-025', venueId: VENUE.hall, start: at(2, 16), end: at(2, 18), expectedAttendance: 50 })
        .expect(409);
    });
  });
});
