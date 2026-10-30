import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * Story 18 — a Coordinator searching venues by date,
 * capacity, accessibility and facilities. Integration tests, one describe per AC.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql; each test then loads the tc-s2 script its
 * test case names (docs/testing/sprint2-test-cases.md). base-venues.sql is
 * NOT loaded by default: the tests compare exact result lists, so each test
 * case brings only the venues it needs.
 */
describe('Story 18 search and filter venues (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';

  /** Fixed users from base-users.sql. */
  const USERS = {
    coordinator: 'coord.a@example.com',
    staff: 'venue.staff@example.com',
    organiser: 'organiser@example.com',
    attendee: 'attendee@example.com',
  } as const;
  const tokens: Record<string, string> = {};

  const as = (who: keyof typeof USERS) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  /** The slot used by tc-s2-19/23/26: 10 March 2027, 09:00–17:00 Singapore time. */
  const SLOT = { from: '2027-03-10T01:00:00.000Z', to: '2027-03-10T09:00:00.000Z' };

  const search = (query: Record<string, string | number> = {}, who: keyof typeof USERS = 'coordinator') =>
    http().get('/venues/search').query(query).set('Authorization', as(who));

  const names = (body: { name: string }[]) => body.map((v) => v.name).sort();

  /** Loads a test case's setup script(s) on top of base-users. */
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
    await given('base-users');
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
    await given('base-users');
  });

  describe('baseline', () => {
    // TC-S2-18 · US-18 Baseline · setup: base-users + tc-s2-18-setup · fails if an empty search left out a published venue
    // Code: GET /venues/search -> VenuesService.search(); with no filters the where clause is status
    // PUBLISHED only.
    it('US-18: an empty search returns every published venue', async () => {
      await given('tc-s2-18-setup');

      const res = await search().expect(200);

      expect(names(res.body)).toEqual(['Alpha', 'Bravo']);
    });

    // TC-S2-18 · US-18 Baseline · setup: base-users + tc-s2-18-setup · fails if a draft venue could appear in search results
    // Code: search() always adds status PUBLISHED to the where clause.
    it('US-18: never returns a draft venue, even one matching every filter', async () => {
      await given('tc-s2-18-setup');

      const res = await search({ minCapacity: 100, facilities: 'STAGE' }).expect(200);

      expect(names(res.body)).toEqual(['Alpha']);
    });

    // TC-S2-18 · US-18 Baseline · setup: base-users · fails if search results could be served from a cache
    // Code: the search route sends Cache-Control: no-store.
    it('US-18: is not cached', async () => {
      const res = await search().expect(200);

      expect(res.headers['cache-control']).toBe('no-store');
    });
  });

  describe('AC-1: date/time excludes venues with a confirmed overlapping booking', () => {
    // TC-S2-19 · US-18 AC-1 · setup: base-users + tc-s2-19-setup · fails if a venue confirmed for the slot were still offered
    // Code: with from and to, freeVenueIds() drops venues holding a confirmed booking (or live hold)
    // that overlaps the slot, buffers included (US-50).
    it('excludes a venue with an APPROVED booking overlapping the slot', async () => {
      await given('tc-s2-19-setup');

      const res = await search(SLOT).expect(200);

      expect(names(res.body)).not.toContain('Approved');
    });

    // TC-S2-19 · US-18 AC-1 · setup: base-users + tc-s2-19-setup · fails if a merely pending booking hid a venue (AC-1 says "confirmed")
    // Code: freeVenueIds() counts only confirmed bookings and live holds; a REQUESTED booking does
    // not block.
    it('includes a venue with only a pending (REQUESTED) booking — AC-1 says "confirmed"', async () => {
      await given('tc-s2-19-setup');

      const res = await search(SLOT).expect(200);

      expect(names(res.body)).toContain('Pending');
    });

    // TC-S2-19 · US-18 AC-1 · setup: base-users + tc-s2-19-setup · fails if a rejected or back-to-back booking were treated as a clash
    // Code: REJECTED bookings hold nothing, and the overlap test is strict, so a booking ending as
    // the slot starts does not clash.
    it('includes venues with a rejected or back-to-back booking', async () => {
      await given('tc-s2-19-setup');

      const res = await search(SLOT).expect(200);

      expect(names(res.body)).toEqual(['Adjacent', 'Pending', 'Rejected', 'Untouched']);
    });

    // TC-S2-19 · US-18 AC-1 · setup: base-users + tc-s2-19-setup · fails if a booking hid its venue for a slot it does not overlap
    // Code: the clash is judged per slot.
    it('includes the approved venue again for a slot that does not overlap', async () => {
      await given('tc-s2-19-setup');

      const res = await search({
        from: '2027-03-11T01:00:00.000Z',
        to: '2027-03-11T09:00:00.000Z',
      }).expect(200);

      expect(names(res.body)).toContain('Approved');
    });

    // TC-S2-19 · US-18 AC-1 · setup: base-users + tc-s2-19-setup · fails if only exact-match bookings counted as clashes, not partial ones
    // Code: the overlap test (start < slot end, end > slot start) catches partial, enclosing and
    // enclosed overlaps.
    it.each([
      ['starts before the slot and runs into it', 'Partial starts before'],
      ['starts inside the slot and runs past it', 'Partial ends after'],
      ['sits entirely inside the slot', 'Partial inside'],
      ['covers the whole slot and more', 'Partial covers'],
    ])('excludes a venue whose confirmed booking %s', async (_shape, venue) => {
      // The tests above use a booking matching the slot exactly; real clashes
      // are usually partial, so each shape has its own venue in the script.
      await given('tc-s2-19-setup');

      const res = await search(SLOT).expect(200);

      expect(names(res.body)).not.toContain(venue);
    });

    // TC-S2-19 · US-18 AC-1 · setup: base-users · fails if a range with only a start were accepted
    // Code: search() refuses from without to, or to without from (400).
    it('rejects half a range', async () => {
      await search({ from: SLOT.from }).expect(400);
    });

    // TC-S2-19 · US-18 AC-1 · setup: base-users · fails if a range ending before it starts were accepted
    // Code: VenueSearchDto.to is @IsAfterField('from') (400).
    it('rejects a range that ends before it starts', async () => {
      await search({ from: SLOT.to, to: SLOT.from }).expect(400);
    });
  });

  describe('AC-2: minimum capacity', () => {
    // TC-S2-20 · US-18 AC-2 · setup: base-users + tc-s2-20-setup · fails if "at least 100" excluded a venue of exactly 100
    // Code: minCapacity -> capacity >= the value (gte).
    it('includes a venue whose capacity equals the minimum', async () => {
      await given('tc-s2-20-setup');

      const res = await search({ minCapacity: 100 }).expect(200);

      expect(names(res.body)).toEqual(['Hundred']);
    });

    // TC-S2-20 · US-18 AC-2 · setup: base-users + tc-s2-20-setup · fails if a venue below the minimum were returned
    // Code: minCapacity -> capacity >= the value (gte).
    it('excludes a venue one below the minimum', async () => {
      await given('tc-s2-20-setup');

      const res = await search({ minCapacity: 101 }).expect(200);

      expect(res.body).toEqual([]);
    });

    // TC-S2-20 · US-18 AC-2 · setup: base-users · fails if a non-numeric capacity were silently ignored
    // Code: VenueSearchDto.minCapacity is @IsInt @IsPositive (400).
    it('rejects a non-numeric minimum', async () => {
      await search({ minCapacity: 'lots' }).expect(400);
    });
  });

  describe('AC-3: accessibility requires every selected feature', () => {
    // TC-S2-21 · US-18 AC-3 · setup: base-users + tc-s2-21-setup · fails if a venue with the one selected feature were missed
    // Code: accessibility -> accessibilityFeatures hasEvery the selected features.
    it('matches a venue offering the one selected feature', async () => {
      await given('tc-s2-21-setup');

      const res = await search({ accessibility: 'STEP_FREE_ACCESS' }).expect(200);

      expect(names(res.body)).toEqual(['Both', 'StepOnly']);
    });

    // TC-S2-21 · US-18 AC-3 · setup: base-users + tc-s2-21-setup · fails if features were OR-ed instead of all required
    // Code: hasEvery requires every selected feature, not any (AND).
    it('excludes a venue missing one of several selected features', async () => {
      await given('tc-s2-21-setup');

      const res = await search({ accessibility: 'STEP_FREE_ACCESS,HEARING_LOOP' }).expect(200);

      expect(names(res.body)).toEqual(['Both']);
    });

    // TC-S2-21 · US-18 AC-3 · setup: base-users + tc-s2-21-setup · fails if ?accessibility=A&accessibility=B were read differently from A,B
    // Code: toList() turns ?accessibility=A&accessibility=B and a single value into one array.
    it('accepts the list as a repeated key', async () => {
      await given('tc-s2-21-setup');

      const res = await http()
        .get('/venues/search?accessibility=STEP_FREE_ACCESS&accessibility=HEARING_LOOP')
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(names(res.body)).toEqual(['Both']);
    });

    // TC-S2-21 · US-18 AC-3 · setup: base-users · fails if a value outside the shared vocabulary were accepted
    // Code: accessibility is @IsEnum(AccessibilityFeature, { each: true }), the vocabulary event
    // requests use (400).
    it('rejects a value outside the shared vocabulary', async () => {
      await search({ accessibility: 'Step-free access' }).expect(400);
    });
  });

  describe('AC-4: facilities require every selected facility', () => {
    // TC-S2-22 · US-18 AC-4 · setup: base-users + tc-s2-22-setup · fails if facilities were OR-ed instead of all required
    // Code: facilities -> facilities hasEvery the selected facilities (AND).
    it('excludes a venue missing one selected facility', async () => {
      await given('tc-s2-22-setup');

      const res = await search({ facilities: 'PROJECTOR,WIFI' }).expect(200);

      expect(names(res.body)).toEqual(['Full']);
    });

    // TC-S2-22 · US-18 AC-4 · setup: base-users + tc-s2-22-setup · fails if a venue offering the facility (plus others) were left out
    // Code: hasEvery is satisfied by a venue offering more than was asked for.
    it('includes every venue offering the selected facility', async () => {
      await given('tc-s2-22-setup');

      const res = await search({ facilities: 'STAGE' }).expect(200);

      expect(names(res.body)).toEqual(['Full', 'NoWifi']);
    });

    // TC-S2-22 · US-18 AC-4 · setup: base-users · fails if a value outside the Facility vocabulary were accepted
    // Code: facilities is @IsEnum(Facility, { each: true }) (400).
    it('rejects a value outside the Facility vocabulary', async () => {
      await search({ facilities: 'Projector' }).expect(400);
    });
  });

  describe('AC-5: filters combine with AND', () => {
    // TC-S2-23 · US-18 AC-5 · setup: base-users + tc-s2-23-setup · fails if any one filter were ignored when combined with the others
    // Code: every filter is added to one where clause, then the date check runs on what is left: AND
    // throughout.
    it('returns only the venue satisfying every dimension at once', async () => {
      await given('tc-s2-23-setup');

      const res = await search({
        ...SLOT,
        minCapacity: 100,
        facilities: 'PROJECTOR',
        accessibility: 'STEP_FREE_ACCESS',
      }).expect(200);

      expect(names(res.body)).toEqual(['Match']);
    });

    // TC-S2-24 · US-18 AC-5 · setup: base-users + tc-s2-24-setup · fails if the name lookup were OR-ed with the other filters
    // Code: name (contains, case-insensitive) is one more condition in the same where clause.
    it('combines a name lookup with the other filters by AND', async () => {
      await given('tc-s2-24-setup');

      const res = await search({ name: 'audit', minCapacity: 500 }).expect(200);

      expect(res.body).toEqual([]);
    });
  });

  describe('Story 15 AC-3 (Sprint 1, owned by Raye): name lookup', () => {
    // Not a Sprint 2 test case: proves Story 15 AC-3, which Raye documents.
    // Code: name -> contains, mode insensitive (the US-15 AC-3 lookup, kept in the search).
    // Uses tc-s2-24-setup (base-users + tc-s2-24-setup) for its data.
    it('finds a published venue by a case-insensitive name fragment', async () => {
      await given('tc-s2-24-setup');

      const res = await search({ name: 'AUDIT' }).expect(200);

      expect(names(res.body)).toEqual(['Sandbox Auditorium']);
    });
  });

  describe('AC-6: no matches is a valid result', () => {
    // TC-S2-25 · US-18 AC-6 · setup: base-users + base-venues · fails if "no matches" returned an error or a broken body instead of an empty list
    // Code: no match is an empty array, not an error; the screen shows its own no-results state.
    it('returns 200 with an empty array', async () => {
      await given('base-venues');

      const res = await search({ minCapacity: 5000 }).expect(200);

      expect(res.body).toEqual([]);
    });
  });

  describe('AC-7: results within two seconds', () => {
    // TC-S2-26 · US-18 AC-7 · setup: base-users + tc-s2-26-setup · fails if a filtered search over 300 venues and 600 bookings took 2 seconds or more
    // Code: one venue query, then freeVenueIds() checks all matching venues in two more queries, not
    // one per venue.
    it('searches 300 venues with 600 bookings in one round trip under 2s', async () => {
      await given('tc-s2-26-setup');

      const started = Date.now();
      const res = await search({
        ...SLOT,
        minCapacity: 100,
        facilities: 'PROJECTOR',
        accessibility: 'STEP_FREE_ACCESS',
      }).expect(200);

      expect(Date.now() - started).toBeLessThan(2000);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('access: Coordinators only', () => {
    // TC-S2-27 · US-18 access · setup: base-users · fails if a role other than Coordinator could search venues by availability
    // Code: search() requires VENUE/CHECK_AVAILABILITY, which only Coordinators hold.
    it.each(['staff', 'organiser', 'attendee'] as const)('refuses %s with 403', async (who) => {
      await search({}, who).expect(403);
    });

    // TC-S2-27 · US-18 access · setup: base-users · fails if search worked without logging in
    // Code: JwtAuthGuard on VenuesController (401).
    it('refuses an unauthenticated caller', async () => {
      await http().get('/venues/search').expect(401);
    });
  });
});
