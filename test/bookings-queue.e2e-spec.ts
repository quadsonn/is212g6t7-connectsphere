import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * Story 21 — Venue Booking Request Queue. Integration tests,
 * one describe per acceptance criterion.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql and base-venues.sql; each test then loads
 * the tc-s2 script its test case names (docs/testing/sprint2-test-cases.md).
 *
 * AC-5 ("nearing their event date") depends on today's date, so this file
 * freezes the clock at NOW. Only Date is faked: real timers keep running, so
 * the HTTP server, Prisma and Supertest behave normally. The setup scripts use
 * fixed dates relative to NOW (e.g. +3 days = 2030-09-04).
 */
describe('Story 21 venue booking request queue (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const NOW = new Date('2030-09-01T00:00:00.000Z');
  const PASSWORD = 'correct-horse-battery-staple';

  /** Fixed users from base-users.sql. */
  const USERS = {
    staff: 'venue.staff@example.com',
    coordinator: 'coord.a@example.com',
  } as const;
  const tokens: Record<string, string> = {};

  /** Fixed venues from base-venues.sql. */
  const VENUE = { hall: 'v-main-hall', room: 'v-seminar-room' } as const;

  const as = (who: keyof typeof USERS) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const queue = (query: Record<string, string> = {}, who: keyof typeof USERS = 'staff') =>
    http().get('/bookings/queue').query(query).set('Authorization', as(who));

  const names = (body: { event: { name: string } }[]) => body.map((e) => e.event.name);

  /** Loads a test case's setup script(s) on top of base-users and base-venues. */
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  beforeAll(async () => {
    // Freeze "now" before anything reads the clock (including the JWTs issued
    // at login, so their expiry is consistent with the frozen time).
    jest.useFakeTimers({
      now: NOW,
      doNotFake: [
        'nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout',
        'setInterval', 'clearInterval', 'queueMicrotask', 'hrtime', 'performance',
      ],
    });

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
    jest.useRealTimers();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await given('base-users', 'base-venues');
  });

  describe('AC-1: only pending requests for venues I manage', () => {
    // TC-S2-41 · setup: base-users + base-venues + tc-s2-01-setup + tc-s2-41-setup · fails if the queue showed another staff member's venue or an already-decided request
    it("excludes other staff's venues and decided requests", async () => {
      await given('tc-s2-01-setup', 'tc-s2-41-setup');

      const res = await queue().expect(200);

      expect(names(res.body)).toEqual(['Mine pending']);
    });

    // TC-S2-41 · setup: base-users + base-venues · fails if a Coordinator could read the Venue Staff queue
    it('is denied to a Coordinator (403)', async () => {
      await queue({}, 'coordinator').expect(403);
    });
  });

  describe('AC-2: each entry shows what is needed to review it', () => {
    // TC-S2-42 · setup: base-users + base-venues + tc-s2-42-setup · fails if an entry lacked the event, venue, times, attendance, requester or organiser
    it('carries event, venue, times, attendance, requester and organiser', async () => {
      await given('tc-s2-42-setup');

      const [entry] = (await queue().expect(200)).body;

      expect(entry).toMatchObject({
        start: '2030-09-21T09:00:00.000Z',
        end: '2030-09-21T12:00:00.000Z',
        expectedAttendance: 80,
        venue: { name: 'Main Hall' },
        event: { name: 'Showcase', organiser: { id: 'u-organiser', name: 'Olivia Organiser' } },
        requestedBy: { id: 'u-coordinator-a', name: 'Cody Coordinator' },
      });
    });
  });

  describe('AC-3: sorting', () => {
    // TC-S2-43 · setup: base-users + base-venues + tc-s2-43-setup · fails if the default order were not soonest event first
    it('sorts by event date, soonest first, by default', async () => {
      await given('tc-s2-43-setup');

      expect(names((await queue().expect(200)).body)).toEqual(['Sooner', 'Later']);
    });

    // TC-S2-43 · setup: base-users + base-venues + tc-s2-43-setup · fails if descending event-date order were ignored
    it('sorts by event date, latest first, when asked', async () => {
      await given('tc-s2-43-setup');

      const res = await queue({ sortBy: 'eventDate', sortOrder: 'desc' }).expect(200);

      expect(names(res.body)).toEqual(['Later', 'Sooner']);
    });

    // TC-S2-43 · setup: base-users + base-venues + tc-s2-43-setup · fails if sorting by submission date sorted by event date instead
    it('sorts by submission date when asked', async () => {
      // In tc-s2-43 "Sooner" was submitted after "Later", so this order
      // differs from the event-date order above.
      await given('tc-s2-43-setup');

      const res = await queue({ sortBy: 'submitted', sortOrder: 'desc' }).expect(200);

      expect(names(res.body)).toEqual(['Sooner', 'Later']);
    });

    // TC-S2-43 · setup: base-users + base-venues · fails if an unknown sort field were silently ignored
    it('rejects an unknown sort field (400)', async () => {
      await queue({ sortBy: 'banana' }).expect(400);
    });
  });

  describe('AC-4: filtering', () => {
    // TC-S2-44 · setup: base-users + base-venues + tc-s2-44-setup · fails if the venue filter let another venue's requests through
    it('filters by venue', async () => {
      await given('tc-s2-44-setup');

      expect(names((await queue({ venueId: VENUE.room }).expect(200)).body)).toEqual(['In room']);
    });

    // TC-S2-44 · setup: base-users + base-venues + tc-s2-44-setup · fails if requests outside the date range were shown
    it('filters by date range', async () => {
      await given('tc-s2-44-setup');

      const res = await queue({
        from: '2030-09-06T00:00:00.000Z',
        to: '2030-09-16T00:00:00.000Z',
      }).expect(200);

      expect(names(res.body)).toEqual(['Inside']);
    });

    // TC-S2-44 · setup: base-users + base-venues + tc-s2-44-setup · fails if the decided view ignored the status filter
    it('filters the decided view by status', async () => {
      await given('tc-s2-44-setup');

      const res = await queue({ view: 'decided', status: 'REJECTED' }).expect(200);

      expect(names(res.body)).toEqual(['Rejected one']);
    });
  });

  describe('AC-5: requests nearing their event date are flagged and prioritised', () => {
    // TC-S2-45 · setup: base-users + base-venues + tc-s2-45-setup · fails if a request under a week away (or already started) weren't flagged and moved to the top
    it('puts requests under a week away at the top, flagged', async () => {
      await given('tc-s2-45-setup');

      // Sorted by submission (oldest first), yet both urgent ones lead.
      const res = await queue({ sortBy: 'submitted', sortOrder: 'asc' }).expect(200);

      expect(res.body.map((e: { event: { name: string }; urgent: boolean }) => [e.event.name, e.urgent])).toEqual([
        ['Overdue', true],
        ['Near', true],
        ['Far', false],
      ]);
    });

    // TC-S2-45 · setup: base-users + base-venues + tc-s2-45-setup · fails if an undecided request whose event had started were dropped or unflagged
    it('still flags a request whose event has started, with a negative day count', async () => {
      await given('tc-s2-45-setup');

      const res = await queue().expect(200);
      const overdue = res.body.find((e: { event: { name: string } }) => e.event.name === 'Overdue');

      expect(overdue).toMatchObject({ urgent: true });
      expect(overdue.daysUntilStart).toBeLessThan(0);
    });
  });

  describe('AC-6: an entry opens the full request detail', () => {
    // TC-S2-46 · setup: base-users + base-venues + tc-s2-42-setup · fails if opening an entry didn't show its layout, accessibility and equipment requirements
    it('GET /bookings/:id returns it with its requirements', async () => {
      await given('tc-s2-42-setup');
      const [entry] = (await queue().expect(200)).body;

      const res = await http().get(`/bookings/${entry.id}`).set('Authorization', as('staff')).expect(200);

      expect(res.body).toMatchObject({
        id: 'b-s2-showcase',
        preferredLayout: 'THEATRE',
        accessibilityRequirements: ['HEARING_LOOP'],
        accessibilityNotes: 'Two hearing aid users',
        equipmentNeeds: '2 wireless mics',
      });
    });
  });

  describe('AC-7: decided requests move to the decided view', () => {
    // TC-S2-47 · setup: base-users + base-venues + tc-s2-47-setup · fails if an approved or rejected request stayed in Pending or never reached Decided
    it('moves a request out of Pending as soon as it is approved or rejected', async () => {
      await given('tc-s2-47-setup');
      expect(names((await queue().expect(200)).body).sort()).toEqual(['Will approve', 'Will reject']);

      await http().post('/bookings/b-s2-will-approve/approve').set('Authorization', as('staff')).send({}).expect(200);
      await http()
        .post('/bookings/b-s2-will-reject/reject')
        .set('Authorization', as('staff'))
        .send({ reason: 'Room under renovation' })
        .expect(200);

      expect((await queue().expect(200)).body).toEqual([]);
      expect(names((await queue({ view: 'decided' }).expect(200)).body).sort()).toEqual([
        'Will approve',
        'Will reject',
      ]);
    });

    // TC-S2-47 · setup: base-users + base-venues + tc-s2-44-setup · fails if a decided request appeared in Pending, or a pending one in Decided
    it('shows approved and rejected requests only under view=decided', async () => {
      await given('tc-s2-44-setup');

      // Pending holds exactly the four REQUESTED rows; neither decided one.
      expect(names((await queue().expect(200)).body).sort()).toEqual([
        'In hall',
        'In room',
        'Inside',
        'Outside',
      ]);
      expect(names((await queue({ view: 'decided' }).expect(200)).body).sort()).toEqual([
        'Approved one',
        'Rejected one',
      ]);
    });
  });
});
