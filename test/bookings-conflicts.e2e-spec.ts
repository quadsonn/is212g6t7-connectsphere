import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-23 (Story 23) — Overlapping Booking Detection, for Venue Staff reviewing
 * a request. Integration tests, one describe per acceptance criterion.
 *
 * The code under test:
 *  - GET /bookings/:id/conflicts -> BookingsService.findConflicts(): finds
 *    every live booking and block on the same venue whose time overlaps
 *    (start < other.end AND end > other.start, so touching is not
 *    overlapping), and sorts them with classifyConflicts() into hard
 *    (APPROVED bookings, Story 16 blocks) and soft (pending requests).
 *  - POST /bookings/:id/approve -> recordDecision(): runs the same check again
 *    under a venue lock at the moment of approval; a hard conflict is 409.
 *  - The database backstop: the VenueBooking_no_overlapping_approved EXCLUDE
 *    constraint refuses two overlapping APPROVED bookings even if the app
 *    check were bypassed.
 *
 * AC-6 (buffer time) is not applied: the customer clarified it isn't needed
 * (see conflictsFor()), so back-to-back bookings are allowed (TC-S2-56).
 * AC-7 (re-check after the time is edited) has no test: a booking's time
 * can't be edited yet (TC-S2-67, code gap).
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql and base-venues.sql; each test then loads
 * the tc-s2 script(s) its test case names (docs/testing/sprint2-test-cases.md).
 */
describe('Story 23 overlapping booking detection (integration)', () => {
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

  /** Fixed rows from tc-s2-48/55/57/61-setup.sql. */
  const BOOKING = {
    showcase: 'BKG-031',
    first: 'BKG-032',
    second: 'BKG-033',
    target: 'BKG-046',
    confirmed: 'BKG-048',
  } as const;

  const as = (who: keyof typeof USERS) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const conflicts = (id: string, who: keyof typeof USERS = 'staff') =>
    http().get(`/bookings/${id}/conflicts`).set('Authorization', as(who));
  const approve = (id: string) => http().post(`/bookings/${id}/approve`).set('Authorization', as('staff')).send({});

  /** "HH:MM" on 1 Oct 2030, UTC, as the API returns it. */
  const at = (hhmm: string) => `2030-10-01T${hhmm}:00.000Z`;
  const names = (rows: { eventName: string }[]) => rows.map((c) => c.eventName);
  const statusOf = async (id: string) => (await prisma.venueBooking.findUniqueOrThrow({ where: { id } })).status;

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
    await app.listen(0, '127.0.0.1');

    prisma = new PrismaClient();

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

  describe('AC-1/AC-4: the check covers every booking on the venue and names each conflict', () => {
    // TC-S2-56 · US-23 AC-1 · setup: base-users + base-venues + tc-s2-56-setup · fails if touching bookings counted as a clash, or any real overlap was missed
    // Code: the overlap rule is start < other.end AND end > other.start, so a
    // booking ending exactly when this one starts (or starting when it ends) is not a conflict.
    // The last column is each shape's pending target booking in tc-s2-56-setup.sql.
    it.each([
      ['ends exactly when it starts', false, 'BKG-040'],
      ['starts exactly when it ends', false, 'BKG-043'],
      ['overlaps by one minute', true, 'BKG-042'],
      ['is fully inside it', true, 'BKG-041'],
      ['fully covers it', true, 'BKG-039'],
    ])('a confirmed booking that %s: conflict = %s', async (_shape, expected, bookingId) => {
      await given('tc-s2-56-setup');

      const res = await conflicts(bookingId).expect(200);

      expect(res.body.hasHardConflict).toBe(expected);
      expect(res.body.hardConflicts).toHaveLength(expected ? 1 : 0);
    });

    // TC-S2-56 · US-23 AC-4 · setup: base-users + base-venues + tc-s2-56-setup · fails if a conflict didn't say which booking it is, by event name and time range
    // Code: each overlap is returned as { bookingId, eventName, start, end }.
    it('names the event and time range of each conflict', async () => {
      await given('tc-s2-56-setup');

      const res = await conflicts('BKG-041').expect(200);

      expect(res.body.hardConflicts).toEqual([
        // US-54 (Sprint 3): each conflict now carries its status, since a hard
        // conflict may be an APPROVED booking or a live HELD hold.
        { bookingId: 'BKG-036', eventName: 'Gala', start: at('10:00'), end: at('11:00'), status: BookingStatus.APPROVED },
      ]);
    });
  });

  describe('AC-2/AC-3: hard and soft conflicts are told apart', () => {
    // TC-S2-57 · US-23 AC-2, AC-3 · setup: base-users + base-venues + tc-s2-57-setup · fails if pending and confirmed overlaps were mixed up, or a rejected booking or the request itself were reported
    // Code: classifyConflicts() puts APPROVED in hardConflicts and REQUESTED in
    // softConflicts; REJECTED bookings and the booking under review are filtered out by conflictsFor().
    it('lists confirmed overlaps as hard and pending ones as soft, ignoring rejected ones and itself', async () => {
      await given('tc-s2-57-setup');

      const res = await conflicts(BOOKING.target).expect(200);

      expect(names(res.body.hardConflicts)).toEqual(['Confirmed']);
      expect(names(res.body.softConflicts)).toEqual(['Pending']);
      expect(JSON.stringify(res.body)).not.toContain(BOOKING.target);
      expect(JSON.stringify(res.body)).not.toContain('BKG-047');
    });

    // TC-S2-57 · US-23 AC-3 · setup: base-users + base-venues + tc-s2-55-setup · fails if a pending overlap alone were treated as a hard block
    // Code: hasHardConflict is true only when a hard conflict or block exists.
    it('reports a pending-only overlap as soft, without a hard conflict', async () => {
      await given('tc-s2-55-setup');

      const res = await conflicts(BOOKING.first).expect(200);

      expect(res.body.hasHardConflict).toBe(false);
      expect(names(res.body.softConflicts)).toEqual(['Second']);
    });
  });

  describe('AC-1/AC-2: blocked-out periods count as hard conflicts', () => {
    // TC-S2-58 · US-23 AC-1, AC-2 · setup: base-users + base-venues + tc-s2-48-setup + tc-s2-58-setup · fails if a blocked-out period (Story 16) overlapping the request went unreported
    // Code: conflictsFor() also reads VenueBlock rows on the venue; any overlap sets hasHardConflict.
    it('lists an overlapping block, and marks the request as hard-conflicting', async () => {
      await given('tc-s2-48-setup', 'tc-s2-58-setup');

      const res = await conflicts(BOOKING.showcase).expect(200);

      expect(res.body.blocks).toEqual([
        expect.objectContaining({ reason: 'Maintenance', start: at('11:00'), end: at('15:00') }),
      ]);
      expect(res.body.hasHardConflict).toBe(true);
    });
  });

  describe('AC-1: a free slot', () => {
    // TC-S2-59 · US-23 AC-1 · setup: base-users + base-venues + tc-s2-48-setup · fails if a request with nothing around it reported any conflict
    // Code: with no overlapping rows, every list is empty and hasHardConflict is false.
    it('reports nothing', async () => {
      await given('tc-s2-48-setup');

      const res = await conflicts(BOOKING.showcase).expect(200);

      expect(res.body).toEqual({ hardConflicts: [], softConflicts: [], blocks: [], hasHardConflict: false });
    });
  });

  describe("access: only the venue's own Venue Staff", () => {
    // TC-S2-60 · US-23 · setup: base-users + base-venues + tc-s2-48-setup + tc-s2-01-setup · fails if another staff member could see this venue's bookings through the check
    // Code: the check loads the booking through findDecidable(), scoped to venues the caller manages.
    it('hides the booking from another Venue Staff member (404)', async () => {
      await given('tc-s2-48-setup', 'tc-s2-01-setup');

      await conflicts(BOOKING.showcase, 'staffB').expect(404);
    });

    // TC-S2-60 · US-23 · setup: base-users + base-venues + tc-s2-48-setup · fails if a Coordinator could use the Venue Staff check
    // Code: the route needs BOOKING/DECIDE (@RequirePermission), which only Venue Staff hold, so the guard answers 403.
    it('refuses a Coordinator (403)', async () => {
      await given('tc-s2-48-setup');

      await conflicts(BOOKING.showcase, 'coordinator').expect(403);
    });
  });

  describe('AC-5: a hard conflict blocks approval until it is resolved', () => {
    // TC-S2-61 · US-23 AC-5 · setup: base-users + base-venues + tc-s2-48-setup + tc-s2-61-setup · fails if a request overlapping a confirmed booking could be approved
    // Code: recordDecision() re-runs the check when approving; a hard conflict
    // throws 409 BOOKING_HARD_CONFLICT with the report, before anything is written.
    it('refuses approval with 409 and leaves the request pending', async () => {
      await given('tc-s2-48-setup', 'tc-s2-61-setup');

      const res = await approve(BOOKING.showcase).expect(409);

      expect(res.body.code).toBe('BOOKING_HARD_CONFLICT');
      expect(names(res.body.report.hardConflicts)).toEqual(['Confirmed']);
      expect(await statusOf(BOOKING.showcase)).toBe(BookingStatus.REQUESTED);
      expect(await prisma.bookingDecision.count({ where: { bookingId: BOOKING.showcase } })).toBe(0);
    });

    // TC-S2-61 · US-23 AC-5 · setup: base-users + base-venues + tc-s2-48-setup + tc-s2-61-setup · fails if resolving the conflict (reversing the confirmed booking) still left the request unapprovable
    // Code: reversing the confirmed booking (Story 22 AC-6) makes it REJECTED,
    // so it no longer counts, and the approval's re-check passes.
    it('allows approval once the conflicting booking has been reversed', async () => {
      await given('tc-s2-48-setup', 'tc-s2-61-setup');

      await http()
        .post(`/bookings/${BOOKING.confirmed}/reverse`)
        .set('Authorization', as('staff'))
        .send({ reason: 'Event moved online' })
        .expect(200);

      await approve(BOOKING.showcase).expect(200);
      expect(await statusOf(BOOKING.showcase)).toBe(BookingStatus.APPROVED);
    });
  });

  describe('AC-3/AC-5: a soft conflict only warns', () => {
    // TC-S2-62 · US-23 AC-3, AC-5 · setup: base-users + base-venues + tc-s2-55-setup · fails if a pending overlap blocked approval, or passed without a warning
    // Code: softWarnings() turns pending overlaps into an OVERLAPS_PENDING_REQUEST warning on the approval response.
    it('approves with a warning naming the pending request', async () => {
      await given('tc-s2-55-setup');

      const res = await approve(BOOKING.first).expect(200);

      expect(res.body.status).toBe(BookingStatus.APPROVED);
      expect(res.body.warnings).toEqual([
        expect.objectContaining({
          code: 'OVERLAPS_PENDING_REQUEST',
          conflicts: [expect.objectContaining({ bookingId: BOOKING.second, eventName: 'Second' })],
        }),
      ]);
    });
  });

  describe('AC-5: the check runs again at the moment of approval', () => {
    // TC-S2-63 · US-23 AC-5 · setup: base-users + base-venues + tc-s2-55-setup · fails if an approval trusted what the page showed when it loaded
    // Code: recordDecision() never reuses an earlier report; it re-checks under
    // the venue lock, so a booking approved meanwhile is seen.
    it('catches a conflict that appeared after the page loaded', async () => {
      await given('tc-s2-55-setup');

      // The page loads: only a soft conflict.
      expect((await conflicts(BOOKING.first).expect(200)).body.hasHardConflict).toBe(false);

      // Meanwhile the other request is approved...
      await approve(BOOKING.second).expect(200);

      // ...so approving now is refused, though the page said it was fine.
      await approve(BOOKING.first).expect(409);
      expect(await statusOf(BOOKING.first)).toBe(BookingStatus.REQUESTED);
    });
  });

  describe('concurrency and the database backstop', () => {
    // TC-S2-64 · US-23 AC-5 · setup: base-users + base-venues + tc-s2-55-setup · fails if two overlapping requests approved at the same moment both succeeded
    // Code: lockVenue() serialises decisions on one venue, so the second approval sees the first and gets 409.
    it('lets exactly one of two simultaneous overlapping approvals through', async () => {
      await given('tc-s2-55-setup');

      const results = await Promise.all([approve(BOOKING.first), approve(BOOKING.second)]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await prisma.venueBooking.count({ where: { status: BookingStatus.APPROVED } })).toBe(1);
    });

    // TC-S2-64 · US-23 AC-5 · setup: base-users + base-venues + tc-s2-48-setup + tc-s2-61-setup · fails if the database itself would store two overlapping confirmed bookings
    // Code: the EXCLUDE constraint (migration ..._us24_no_overlapping_approved_bookings)
    // raises 23P01. This writes straight to the table, bypassing the service and its lock.
    it('is backed by the database: a direct write of an overlapping APPROVED booking fails', async () => {
      await given('tc-s2-48-setup', 'tc-s2-61-setup');

      const error = await prisma.venueBooking
        .update({ where: { id: BOOKING.showcase }, data: { status: BookingStatus.APPROVED } })
        .catch((e: Error) => e);

      expect(String(error)).toMatch(/23P01|VenueBooking_no_overlapping_approved/);
      expect(await statusOf(BOOKING.showcase)).toBe(BookingStatus.REQUESTED);
    });

    // TC-S2-64 · US-23 · setup: base-users + base-venues + tc-s2-64-setup · fails if the constraint refused back-to-back confirmed bookings or overlapping pending ones
    // Code: the constraint uses a half-open range '[)' and only covers status = 'APPROVED'.
    it('still allows back-to-back APPROVED bookings and overlapping pending ones', async () => {
      await given('tc-s2-64-setup');

      expect(await prisma.venueBooking.count()).toBe(4);
    });
  });
});
