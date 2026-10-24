import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-05 e2e — one describe per acceptance criterion.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql; a test that needs more loads the tc-s1
 * script its test case names (see docs/testing/sprint1-test-cases.md).
 */
describe('US-05 organiser views status of own requests (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';

  /** Fixed rows from base-users.sql. */
  const USERS = {
    organiser: { id: 'USR-006', email: 'organiser@example.com' },
    coordinator: { id: 'USR-004', email: 'coord.a@example.com' },
  } as const;

  /** Fixed rows from tc-s1-22-setup.sql: loaded only by the tests that need them. */
  const EXTRA_USERS = {
    otherOrganiser: { id: 'USR-007', email: 'other@example.com' },
  } as const;
  const ids = Object.fromEntries(
    Object.entries({ ...USERS, ...EXTRA_USERS }).map(([key, user]) => [key, user.id]),
  ) as Record<string, string>;
  const tokens: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  /** Loads a test case's setup script(s) on top of base-users. */
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  /** Fixed rows from the tc-s1 setup scripts (see test/fixtures/sql/README.md). */
  const EVENT = {
    submitted: { id: 'EVT-146' },
    rejectedDirect: { id: 'EVT-010' },
    approvedOnly: { id: 'EVT-002' },
    theirs: { id: 'EVT-148' },
    theirsRejected: { id: 'EVT-149' },
  } as const;

  const completeFields = {
    name: 'Freshman Orientation 2030',
    purpose: 'Welcome new students',
    description: 'Full-day programme',
    category: 'Student engagement',
    proposedStart: '2030-10-01T09:00:00.000Z',
    proposedEnd: '2030-10-01T17:00:00.000Z',
    expectedAttendance: 300,
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Same global setup as main.ts (pipes, UnauthorizedFilter, CORS).
    configureApp(app);
    // Bound to 127.0.0.1 explicitly: with init() alone, or a dual-stack [::]
    // listener, the OS can hand out a port another local process already holds
    // on 127.0.0.1, and Supertest then talks to that process (hangs, or
    // "Parse Error: Expected HTTP/").
    await app.listen(0, '127.0.0.1');

    prisma = new PrismaClient();

    // Log each user in once, through the real endpoint. JWTs are stateless and
    // the users are re-created with the same IDs after every reset, so these
    // tokens stay valid for every test in the file.
    await resetDb(prisma);
    await loadSql(prisma, 'base-users');
    await loadSql(prisma, 'tc-s1-22-setup');
    for (const [key, { email }] of Object.entries({ ...USERS, ...EXTRA_USERS })) {
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
  });

  describe('AC-1: each request shows its current status', () => {
    // TC-S1-39 · setup: base-users + tc-s1-39-setup · fails if a request showed a status other than its own
    it('reports every status in the lifecycle', async () => {
      await given('tc-s1-39-setup');

      const res = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);

      const byName = Object.fromEntries(
        res.body.map((e: { name: string; status: string }) => [e.name, e.status]),
      );

      for (const status of Object.values(EventStatus)) {
        expect(byName[`Request ${status}`]).toBe(status);
      }
    });

    // TC-S1-40 · setup: base-users · fails if an Organiser with no requests got an error instead of an empty list
    it('returns an empty list when the Organiser has none', async () => {
      const res = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('refuses a non-Organiser', async () => {
      await http()
        .get('/events/mine')
        .set('Authorization', as('coordinator'))
        .expect(403);
    });

    it('refuses an unauthenticated caller', async () => {
      await http().get('/events/mine').expect(401);
    });
  });

  describe('AC-2: a rejected request shows the Coordinator’s reason', () => {
    // TC-S1-41 · setup: base-users + tc-s1-41-setup · fails if a rejected request's reason was missing
    it('includes decisionReason on a rejected request', async () => {
      await given('tc-s1-41-setup');

      const res = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body[0].status).toBe(EventStatus.REJECTED);
      expect(res.body[0].decisionReason).toBe('Clashes with the examination period');
    });

    // TC-S1-41 · setup: base-users + tc-s1-41-setup · fails if a rejected request's reason was missing
    it('includes it when opening the request directly', async () => {
      await given('tc-s1-41-setup');
      const seeded = EVENT.rejectedDirect;

      const res = await http()
        .get(`/events/mine/${seeded.id}`)
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body.decisionReason).toBe('Venue capacity insufficient');
    });
  });

  describe('AC-3: clarification is shown, with the question', () => {
    // TC-S1-42 · setup: base-users + tc-s1-42-setup · fails if an outstanding clarification or its question was not shown
    it('flags clarification and shows what is asked', async () => {
      await given('tc-s1-42-setup');

      const res = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body[0].clarificationRequested).toBe(true);
      expect(res.body[0].clarificationRequest).toMatch(/expected attendance/);
    });

    // TC-S1-42 · setup: base-users + tc-s1-42-setup · fails if an outstanding clarification or its question was not shown
    it('distinguishes a returned request from an ordinary draft', async () => {
      await given('tc-s1-42-setup');

      const res = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);

      const byName = Object.fromEntries(
        res.body.map((e: { name: string; clarificationRequested: boolean }) => [
          e.name,
          e.clarificationRequested,
        ]),
      );

      expect(byName['Plain draft']).toBe(false);
      expect(byName['Returned for clarification']).toBe(true);
    });

    // TC-S1-43 · setup: base-users + tc-s1-01-setup · fails if a clarification flag appeared when nothing was asked
    it('reports no clarification when none was asked', async () => {
      await given('tc-s1-01-setup');

      const res = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body[0].clarificationRequested).toBe(false);
      expect(res.body[0].clarificationRequest).toBeNull();
    });
  });

  describe('AC-4: the displayed status is the most recent valid state', () => {
    // TC-S1-44 · setup: base-users · fails if the list showed a stale status after a transition
    it('reflects a transition made through the real submit endpoint', async () => {
      const created = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send(completeFields)
        .expect(201);

      const before = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);
      expect(before.body[0].status).toBe(EventStatus.DRAFT);

      await http()
        .post(`/events/${created.body.id}/submit`)
        .set('Authorization', as('organiser'))
        .expect(200);

      const after = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);
      expect(after.body[0].status).toBe(EventStatus.SUBMITTED);
    });

    it('reflects a later submitted -> under review change', async () => {
      await given('tc-s1-01-setup');
      const seeded = EVENT.submitted;

      await prisma.eventRequest.update({
        where: { id: seeded.id },
        data: { status: EventStatus.UNDER_REVIEW },
      });

      const res = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body[0].status).toBe(EventStatus.UNDER_REVIEW);
    });

    // TC-S1-45 · setup: base-users + tc-s1-45-setup · fails if a repeated read served a cached status
    it('does not serve a stale status on a repeated read', async () => {
      await given('tc-s1-45-setup');
      const seeded = EVENT.approvedOnly;

      await http().get('/events/mine').set('Authorization', as('organiser')).expect(200);

      await prisma.eventRequest.update({
        where: { id: seeded.id },
        data: { status: EventStatus.PLANNING },
      });

      const res = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body[0].status).toBe(EventStatus.PLANNING);
    });
  });

  describe('AC-5: another Organiser’s requests never appear', () => {
    // TC-S1-46 · setup: base-users + tc-s1-22-setup + tc-s1-46-setup · fails if another Organiser's request or reason leaked
    it('excludes them from the list', async () => {
      await given('tc-s1-22-setup', 'tc-s1-46-setup');

      const res = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Mine');
    });

    // TC-S1-46 · setup: base-users + tc-s1-22-setup + tc-s1-46-setup · fails if another Organiser's request or reason leaked
    it('denies fetching another Organiser’s request by id', async () => {
      await given('tc-s1-22-setup', 'tc-s1-46-setup');
      const theirs = EVENT.theirs;

      const res = await http()
        .get(`/events/mine/${theirs.id}`)
        .set('Authorization', as('organiser'))
        .expect(404);

      expect(res.body.name).toBeUndefined();
    });

    // TC-S1-46 · setup: base-users + tc-s1-22-setup + tc-s1-46-setup · fails if another Organiser's request or reason leaked
    it('does not leak a rejection reason belonging to someone else', async () => {
      await given('tc-s1-22-setup', 'tc-s1-46-setup');
      const theirs = EVENT.theirsRejected;

      const list = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);
      expect(JSON.stringify(list.body)).not.toMatch(/CONFIDENTIAL/);

      const single = await http()
        .get(`/events/mine/${theirs.id}`)
        .set('Authorization', as('organiser'))
        .expect(404);
      expect(JSON.stringify(single.body)).not.toMatch(/CONFIDENTIAL/);
    });
  });

  describe('route resolution', () => {
    it('does not treat "mine" as an event id', async () => {
      // GET /events/mine is declared before GET /events/:id; if that order
      // ever changes this returns 404 instead of the list.
      await given('tc-s1-01-setup');

      const res = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
