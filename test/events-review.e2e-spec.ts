import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-07 (Review a submitted request for clarity/completeness), integration tests: the real Nest app over HTTP
 * (Supertest) and the local test database, one describe per acceptance
 * criterion. Code under test: GET /events/assigned/:id (findAssignedRequest) and
 * POST /events/:id/approve -> approve(): assertIsAssignedTo, claimForDecision
 * (row lock), setStatus(APPROVED).
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql; each test then loads the tc-s1 script its
 * test case names (see docs/testing/sprint1-test-cases.md).
 */
describe('US-07 coordinator reviews and approves (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';

  /** Fixed rows from base-users.sql. */
  const USERS = {
    organiser: { id: 'USR-006', email: 'organiser@example.com' },
    coordinatorA: { id: 'USR-004', email: 'coord.a@example.com' },
    coordinatorB: { id: 'USR-005', email: 'coord.b@example.com' },
    attendee: { id: 'USR-001', email: 'attendee@example.com' },
    /** From tc-s1-25-setup.sql, loaded only by the tests that need it. */
    lead: { id: 'USR-012', email: 'lead@example.com' },
  } as const;
  const ids = Object.fromEntries(
    Object.entries(USERS).map(([key, user]) => [key, user.id]),
  ) as Record<string, string>;
  const tokens: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  /** Fixed rows from the tc-s1 setup scripts (see test/fixtures/sql/README.md). */
  const EVENT = {
    submitted: { id: 'EVT-146' },
    submitted2: { id: 'EVT-147' },
    draft: { id: 'EVT-004' },
    underReview: { id: 'EVT-151' },
    underReview2: { id: 'EVT-152' },
    approved: { id: 'EVT-001' },
    rejected: { id: 'EVT-009' },
    returned: { id: 'EVT-012' },
    cancelled: { id: 'EVT-003' },
    withQuestion: { id: 'EVT-154' },
    stale: { id: 'EVT-133' },
    unassigned: { id: 'EVT-150' },
  } as const;

  /** Loads a test case's setup script(s) on top of base-users. */
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  /** The catalogue row for each status the AC-1 table shows. */
  const EVENT_BY_STATUS: Record<string, { id: string }> = {
    [EventStatus.DRAFT]: EVENT.draft,
    [EventStatus.SUBMITTED]: EVENT.submitted,
    [EventStatus.UNDER_REVIEW]: EVENT.underReview,
    [EventStatus.APPROVED]: EVENT.approved,
    [EventStatus.REJECTED]: EVENT.rejected,
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

    // Log each base user in once, through the real endpoint. JWTs are
    // stateless and the users are re-created with the same IDs after every
    // reset, so these tokens stay valid for every test in the file.
    await resetDb(prisma);
    await loadSql(prisma, 'base-users');
    await loadSql(prisma, 'tc-s1-25-setup');
    for (const [key, { email }] of Object.entries(USERS)) {
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

  describe('AC-1: current status is displayed', () => {
    // TC-S1-02 · US-07 AC-1 · setup: base-users + tc-s1-02-setup · fails if the Coordinator view reported a different status from the one stored
    // Code: GET /events/assigned/:id (findAssignedRequest, @Roles EVENT_COORDINATOR) returns the
    // stored status.
    it.each([
      EventStatus.DRAFT,
      EventStatus.SUBMITTED,
      EventStatus.UNDER_REVIEW,
      EventStatus.APPROVED,
      EventStatus.REJECTED,
    ])('shows %s', async (status) => {
      await given('tc-s1-02-setup');
      const event = EVENT_BY_STATUS[status];

      const res = await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      expect(res.body.status).toBe(status);
    });

    // TC-S1-02 · US-07 AC-1 · setup: base-users + tc-s1-02-setup · fails if a returned request lost its status or its outstanding question
    // Code: RETURNED is reported with clarificationRequest in its statusView.
    it('shows a returned request with its outstanding question', async () => {
      // US-08 made RETURNED a status in its own right.
      await given('tc-s1-02-setup');
      const event = EVENT.returned;

      const res = await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      expect(res.body.status).toBe(EventStatus.RETURNED);
      expect(res.body.clarificationRequested).toBe(true);
      expect(res.body.clarificationRequest).toMatch(/attendance/);
    });

    // TC-S1-02 · US-07 AC-1 · setup: base-users + tc-s1-02-setup · fails if a draft were reported as returned
    // Code: statusView only reports a clarification when clarificationRequest is set.
    it('does not mark an ordinary draft as returned', async () => {
      await given('tc-s1-02-setup');
      const event = EVENT.draft;

      const res = await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      expect(res.body.clarificationRequested).toBe(false);
    });
  });

  describe('AC-2: all details are displayed', () => {
    // TC-S1-03 · US-07 AC-2 · setup: base-users + tc-s1-01-setup · fails if a detail field was dropped or altered in the Coordinator view
    // Code: findAssignedRequest() returns the full stored row to the assigned Coordinator.
    it('returns name, purpose, description and proposed date & time', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      const res = await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      expect(res.body).toMatchObject({
        name: 'Freshman Orientation 2030',
        purpose: 'Welcome new students',
        description: 'Full-day programme with talks and booths',
      });
      expect(new Date(res.body.proposedStart).toISOString()).toBe(
        '2030-10-01T09:00:00.000Z',
      );
      expect(new Date(res.body.proposedEnd).toISOString()).toBe(
        '2030-10-01T17:00:00.000Z',
      );
    });
  });

  describe('AC-3: approving updates the status', () => {
    // TC-S1-01 · US-07 AC-3 · setup: base-users + tc-s1-01-setup · fails if Approve did not persist APPROVED
    // Code: POST /events/:id/approve -> approve(): assertIsAssignedTo, claimForDecision (row
    // lock), setStatus(APPROVED).
    it('moves a submitted request to APPROVED', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      const res = await http()
        .post(`/events/${event.id}/approve`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      expect(res.body.status).toBe(EventStatus.APPROVED);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.status).toBe(EventStatus.APPROVED);
    });

    // TC-S1-01 · US-07 AC-3 · setup: base-users + tc-s1-02-setup · fails if a request under review could not be approved
    // Code: the status machine allows UNDER_REVIEW -> APPROVED.
    it('approves from UNDER_REVIEW', async () => {
      await given('tc-s1-02-setup');
      const event = EVENT.underReview;

      await http()
        .post(`/events/${event.id}/approve`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.status).toBe(EventStatus.APPROVED);
    });

    // TC-S1-01 · US-07 AC-3, US-05 AC-4 · setup: base-users + tc-s1-01-setup · fails if the Organiser's list did not reflect the approval
    // Code: the Organiser's GET /events/mine reads the new status from the same row.
    it('is visible to the Organiser afterwards', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await http()
        .post(`/events/${event.id}/approve`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      const mine = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(mine.body[0].status).toBe(EventStatus.APPROVED);
    });

    // TC-S1-04 · US-07 AC-3 · setup: base-users + tc-s1-02-setup · fails if a DRAFT could be approved (illegal transition)
    // Code: setStatus() checks the status machine; DRAFT -> APPROVED is not an edge (409).
    it('refuses to approve a DRAFT', async () => {
      await given('tc-s1-02-setup');
      const event = EVENT.draft;

      await http()
        .post(`/events/${event.id}/approve`)
        .set('Authorization', as('coordinatorA'))
        .expect(409);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.status).toBe(EventStatus.DRAFT);
    });

    // TC-S1-04 · US-07 AC-3 · setup: base-users + tc-s1-02-setup · fails if a CANCELLED request could be approved
    // Code: CANCELLED has no outgoing edge, so 409.
    it('refuses to approve a CANCELLED request', async () => {
      await given('tc-s1-02-setup');
      const event = EVENT.cancelled;

      await http()
        .post(`/events/${event.id}/approve`)
        .set('Authorization', as('coordinatorA'))
        .expect(409);
    });

    // TC-S1-05 · US-07 AC-3 · setup: base-users + tc-s1-01-setup · fails if a repeated Approve errored or changed the status
    // Code: approve() treats APPROVED -> APPROVED as a no-op and records nothing new.
    it('is idempotent — approving twice leaves it APPROVED', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await http()
        .post(`/events/${event.id}/approve`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);
      await http()
        .post(`/events/${event.id}/approve`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.status).toBe(EventStatus.APPROVED);
    });

    // TC-S1-01 · US-07 AC-3 · setup: base-users + tc-s1-01-setup · fails if an approved request still showed an old question or reason
    // Code: approve() sets clarificationRequest and decisionReason to null before setStatus().
    it('clears a stale clarification and rejection reason', async () => {
      await given('tc-s1-02-setup');
      const event = EVENT.stale;

      await http()
        .post(`/events/${event.id}/approve`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.clarificationRequest).toBeNull();
      expect(stored.decisionReason).toBeNull();
    });
  });

  describe('conflict: simultaneous decisions on one request', () => {
    // TC-S1-07 · US-07 AC-3, US-08 AC-3 · setup: base-users + tc-s1-01-setup (fresh before each of 20 iterations) · fails if approve and reject can both succeed, or the final status contradicts the winner
    // Code: claimForDecision() row-locks the request (SELECT ... FOR UPDATE) while it still has
    // the status read; the loser gets 409 (audit gap #2).
    it('lets exactly one of a simultaneous approve and reject succeed, and stores that outcome', async () => {
      const ITERATIONS = 20;
      const violations: string[] = [];

      for (let i = 1; i <= ITERATIONS; i++) {
        await resetDb(prisma);
        await loadSql(prisma, 'base-users');
        await given('tc-s1-01-setup');
        const event = EVENT.submitted;

        const [approve, reject] = await Promise.all([
          http().post(`/events/${event.id}/approve`).set('Authorization', as('coordinatorA')),
          http()
            .post(`/events/${event.id}/reject`)
            .set('Authorization', as('coordinatorA'))
            .send({ reason: 'Clashes with the examination period' }),
        ]);
        const stored = await prisma.eventRequest.findUniqueOrThrow({ where: { id: event.id } });

        const winners = [approve, reject].filter((r) => r.status === 200).length;
        const loserRefused = [approve, reject].some((r) => r.status === 409);
        const expected =
          approve.status === 200 ? EventStatus.APPROVED : EventStatus.REJECTED;
        // Only the winner's reason is kept: none after an approval.
        const expectedReason =
          approve.status === 200 ? null : 'Clashes with the examination period';

        if (
          winners !== 1 ||
          !loserRefused ||
          stored.status !== expected ||
          stored.decisionReason !== expectedReason
        ) {
          violations.push(
            `iteration ${i}: approve ${approve.status}, reject ${reject.status}, stored ${stored.status} / ${stored.decisionReason}`,
          );
        }
      }

      expect(violations).toEqual([]);
    });
  });

  describe('assignment ownership and role', () => {
    // TC-S1-06 · US-07 AC-3, US-02 AC-6 · setup: base-users + tc-s1-01-setup · fails if a Coordinator could approve an event assigned to someone else
    // Code: assertEventAccess(REVIEW) under ASSIGNED scope finds nothing, so 404.
    it('refuses a Coordinator assigned to a different event', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await http()
        .post(`/events/${event.id}/approve`)
        .set('Authorization', as('coordinatorB'))
        .expect(404);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.status).toBe(EventStatus.SUBMITTED);
    });

    // TC-S1-06 · US-07 AC-3, US-02 AC-6 · setup: base-users + tc-s1-02-setup · fails if a Coordinator could approve a request nobody assigned to them
    // Code: coordinatorId is NULL, so ASSIGNED scope never matches (Week 7 Change 5).
    it('refuses to approve an unassigned request from the pool', async () => {
      await given('tc-s1-02-setup');
      const event = EVENT.unassigned;

      await http()
        .post(`/events/${event.id}/approve`)
        .set('Authorization', as('coordinatorB'))
        .expect(404);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.status).toBe(EventStatus.SUBMITTED);
    });

    // TC-S1-06 · US-07 AC-3, US-10 · setup: base-users + tc-s1-02-setup + tc-s1-25-setup · fails if the Coordinator the Lead assigned could not approve
    // Code: POST /assignments/queue/:id/assign sets coordinatorId; approve() then passes
    // assertIsAssignedTo.
    it('approves once that request has been assigned', async () => {
      await given('tc-s1-02-setup', 'tc-s1-25-setup');
      const event = EVENT.unassigned;
      // Week 7 Change 5: the Lead assigns it from the unassigned queue (US-55).
      await http()
        .post(`/assignments/queue/${event.id}/assign`)
        .set('Authorization', as('lead'))
        .send({ coordinatorId: ids.coordinatorB })
        .expect(200);

      await http()
        .post(`/events/${event.id}/approve`)
        .set('Authorization', as('coordinatorB'))
        .expect(200);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.status).toBe(EventStatus.APPROVED);
    });

    // TC-S1-06 · US-07 AC-3, US-02 AC-3 · setup: base-users + tc-s1-01-setup · fails if an Organiser or Attendee could approve
    // Code: POST /events/:id/approve is @Roles(EVENT_COORDINATOR); RolesGuard answers 403.
    it.each(['organiser', 'attendee'])('refuses %s at the role gate', async (who) => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await http()
        .post(`/events/${event.id}/approve`)
        .set('Authorization', as(who))
        .expect(403);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.status).toBe(EventStatus.SUBMITTED);
    });

    // TC-S1-06 · US-07 AC-3, US-02 AC-8 · setup: base-users + tc-s1-01-setup · fails if a request could be approved without signing in
    // Code: JwtAuthGuard answers 401.
    it('refuses an unauthenticated caller', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await http().post(`/events/${event.id}/approve`).expect(401);
    });
  });
});
