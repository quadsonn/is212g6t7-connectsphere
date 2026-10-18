import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { dayKeyOf, resolveRange } from '../src/venues/availability';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * Story 17 — a Coordinator checking a venue's availability
 * calendar before requesting it. Integration tests, one describe per AC.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql and base-venues.sql; each test then loads
 * the tc-s2 script its test case names (docs/testing/sprint2-test-cases.md).
 */
describe('Story 17 view a venue availability calendar (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';

  /** Fixed users from base-users.sql. */
  const USERS = {
    coordinator: 'coord.a@example.com',
    staff: 'venue.staff@example.com',
    organiser: 'organiser@example.com',
    tech: 'tech.support@example.com',
    attendee: 'attendee@example.com',
  } as const;
  const tokens: Record<string, string> = {};

  /** Fixed venues from base-venues.sql. */
  const VENUE = {
    hall: 'v-main-hall',
    room: 'v-seminar-room',
    draft: 'v-draft-annex',
  } as const;

  /** The event in tc-s2-12/14/15-setup whose details must never leak (AC-3). */
  const SECRET = {
    eventId: 'e-s2-secret',
    eventName: 'Secret Board Offsite',
    organiserId: 'u-organiser',
    organiserName: 'Olivia Organiser',
  } as const;

  const as = (who: keyof typeof USERS) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const availability = (who: keyof typeof USERS, venueId: string, query = '') =>
    http()
      .get(`/venues/${venueId}/availability${query}`)
      .set('Authorization', as(who));

  const statusOn = (body: { date: string; status: string }[], date: string) =>
    body.find((day) => day.date === date)?.status;

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
    await given('base-users', 'base-venues');
  });

  describe('AC-1: the calendar covers at least the current and next month', () => {
    // TC-S2-12 · setup: base-users + base-venues · fails if the default range missed today or stopped before the end of next month
    it('defaults to every day of the current and next month', async () => {
      // Reads today's date by design: the AC is about the current month.
      const res = await availability('coordinator', VENUE.hall).expect(200);

      const expected = resolveRange({}, new Date());
      expect(res.body[0].date).toBe(expected.from);
      expect(res.body.at(-1).date).toBe(expected.to);
      expect(res.body.map((d: { date: string }) => d.date)).toContain(dayKeyOf(new Date()));
    });

    // TC-S2-12 · setup: base-users + base-venues + tc-s2-12-setup · fails if an existing booking did not show on its venue's calendar
    it('shows existing bookings for that venue', async () => {
      await given('tc-s2-12-setup');

      const res = await availability('coordinator', VENUE.hall, '?month=2027-03').expect(200);

      expect(statusOn(res.body, '2027-03-10')).toBe('booked');
    });

    // TC-S2-12 · setup: base-users + base-venues + tc-s2-12-setup · fails if one venue's booking appeared on a different venue's calendar
    it("ignores another venue's bookings", async () => {
      await given('tc-s2-12-setup');

      const res = await availability('coordinator', VENUE.room, '?month=2027-03').expect(200);

      expect(statusOn(res.body, '2027-03-10')).toBe('free');
    });

    // TC-S2-12 · setup: base-users + base-venues · fails if a browser or proxy could serve a stale calendar
    it('is not cached', async () => {
      const res = await availability('coordinator', VENUE.hall).expect(200);

      expect(res.headers['cache-control']).toBe('no-store');
    });
  });

  describe('AC-2: each month loads on its own, within two seconds', () => {
    // TC-S2-13 · setup: base-users + base-venues · fails if a future month returned the wrong days or took 2 seconds or more
    it('returns exactly the requested future month', async () => {
      const started = Date.now();
      const res = await availability('coordinator', VENUE.hall, '?month=2027-02').expect(200);

      expect(Date.now() - started).toBeLessThan(2000);
      expect(res.body).toHaveLength(28);
      expect(res.body[0].date).toBe('2027-02-01');
      expect(res.body.at(-1).date).toBe('2027-02-28');
    });

    // TC-S2-13 · setup: base-users + base-venues + tc-s2-13-setup · fails if a heavily booked month took 2 seconds or more
    it('still loads a busy month within two seconds', async () => {
      // The test above times an almost empty month; this one times a heavily
      // booked month (168 bookings), the realistic worst case.
      await given('tc-s2-13-setup');

      const started = Date.now();
      const res = await availability('coordinator', VENUE.hall, '?month=2027-02').expect(200);

      expect(Date.now() - started).toBeLessThan(2000);
      expect(res.body).toHaveLength(28);
      expect(res.body.every((d: { status: string }) => d.status === 'booked')).toBe(true);
    });

    // TC-S2-13 · setup: base-users + base-venues · fails if a month that doesn't exist were accepted
    it('rejects a malformed month', async () => {
      await availability('coordinator', VENUE.hall, '?month=2027-13').expect(400);
    });

    // TC-S2-13 · setup: base-users + base-venues · fails if an oversized range could be requested in one go
    it('rejects a range longer than two months', async () => {
      await availability('coordinator', VENUE.hall, '?from=2027-01-01&to=2027-04-01').expect(400);
    });
  });

  describe('AC-3: booked days are distinguished without identifying the booking', () => {
    // TC-S2-14 · setup: base-users + base-venues + tc-s2-14-setup · fails if a day carried any field beyond its date and status
    it('returns only date and status for every day', async () => {
      await given('tc-s2-14-setup');

      const res = await availability('coordinator', VENUE.hall, '?month=2027-03').expect(200);

      for (const day of res.body) {
        expect(Object.keys(day).sort()).toEqual(['date', 'status']);
      }
    });

    // TC-S2-14 · setup: base-users + base-venues + tc-s2-14-setup · fails if another booking's event or organiser leaked to the Coordinator
    it('never mentions the event, its id, or its organiser', async () => {
      await given('tc-s2-14-setup');

      const res = await availability('coordinator', VENUE.hall, '?month=2027-03').expect(200);
      const raw = JSON.stringify(res.body);

      for (const secret of Object.values(SECRET)) {
        expect(raw).not.toContain(secret);
      }
    });

    // TC-S2-14 · setup: base-users + base-venues + tc-s2-14-setup · fails if a confirmed day were not marked booked, or the day after were
    it('marks an approved day as booked', async () => {
      await given('tc-s2-14-setup');

      const res = await availability('coordinator', VENUE.hall, '?month=2027-03').expect(200);

      expect(statusOn(res.body, '2027-03-10')).toBe('booked');
      expect(statusOn(res.body, '2027-03-11')).toBe('free');
    });
  });

  describe('AC-4: pending-only days are tentative', () => {
    // TC-S2-15 · setup: base-users + base-venues + tc-s2-15-setup · fails if a pending-only day looked free or booked instead of tentative
    it('marks a day with only a pending request as tentative', async () => {
      await given('tc-s2-15-setup');

      const res = await availability('coordinator', VENUE.hall, '?month=2027-03').expect(200);

      expect(statusOn(res.body, '2027-03-12')).toBe('tentative');
    });

    // TC-S2-15 · setup: base-users + base-venues + tc-s2-15-setup · fails if a rejected request still made its day look taken
    it('treats a rejected request as free', async () => {
      await given('tc-s2-15-setup');

      const res = await availability('coordinator', VENUE.hall, '?month=2027-03').expect(200);

      expect(statusOn(res.body, '2027-03-14')).toBe('free');
    });
  });

  describe('access: Coordinators only, published venues only', () => {
    // TC-S2-16 · setup: base-users + base-venues · fails if a role other than Coordinator could read a venue's availability
    it.each(['staff', 'organiser', 'tech', 'attendee'] as const)('refuses %s with 403', async (who) => {
      await availability(who, VENUE.hall).expect(403);
    });

    // TC-S2-16 · setup: base-users + base-venues · fails if availability were readable without logging in
    it('refuses an unauthenticated caller', async () => {
      await http().get(`/venues/${VENUE.hall}/availability`).expect(401);
    });

    // TC-S2-16 · setup: base-users + base-venues · fails if an unpublished (draft) venue's calendar were reachable
    it('reports a draft venue as not found', async () => {
      await availability('coordinator', VENUE.draft).expect(404);
    });

    // TC-S2-16 · setup: base-users + base-venues · fails if an unknown venue id returned anything but 404
    it('reports an unknown venue as not found', async () => {
      await availability('coordinator', 'does-not-exist').expect(404);
    });
  });
});
