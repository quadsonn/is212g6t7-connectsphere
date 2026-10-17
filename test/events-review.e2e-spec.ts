import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-07 e2e — one describe per acceptance criterion.
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
    organiser: { id: 'u-organiser', email: 'organiser@example.com' },
    coordinatorA: { id: 'u-coordinator-a', email: 'coord.a@example.com' },
    coordinatorB: { id: 'u-coordinator-b', email: 'coord.b@example.com' },
    attendee: { id: 'u-attendee', email: 'attendee@example.com' },
  } as const;
  const ids = Object.fromEntries(
    Object.entries(USERS).map(([key, user]) => [key, user.id]),
  ) as Record<string, string>;
  const tokens: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  /** Fixed rows from the tc-s1 setup scripts (see test/fixtures/sql/README.md). */
  const EVENT = {
    submitted: { id: 'e-submitted' },
    submitted2: { id: 'e-submitted-2' },
    draft: { id: 'e-draft' },
    underReview: { id: 'e-under-review' },
    underReview2: { id: 'e-under-review-2' },
    approved: { id: 'e-approved' },
    rejected: { id: 'e-rejected' },
    returned: { id: 'e-returned' },
    cancelled: { id: 'e-cancelled' },
    withQuestion: { id: 'e-with-question' },
    stale: { id: 'e-stale' },
    unassigned: { id: 'e-unassigned' },
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
    // TC-S1-02 · setup: base-users + tc-s1-02-setup · fails if the Coordinator view reported a different status from the one stored
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

    // TC-S1-02 · setup: base-users + tc-s1-02-setup · fails if a returned request lost its status or its outstanding question
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
    // TC-S1-03 · setup: base-users + tc-s1-01-setup · fails if a detail field was dropped or altered in the Coordinator view
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
    // TC-S1-01 · setup: base-users + tc-s1-01-setup · fails if Approve did not persist APPROVED
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

    // TC-S1-01 · setup: base-users + tc-s1-01-setup · fails if the Organiser's list did not reflect the approval
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

    // TC-S1-04 · setup: base-users + tc-s1-02-setup · fails if a DRAFT could be approved (illegal transition)
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

    // TC-S1-04 · setup: base-users + tc-s1-02-setup · fails if a CANCELLED request could be approved
    it('refuses to approve a CANCELLED request', async () => {
      await given('tc-s1-02-setup');
      const event = EVENT.cancelled;

      await http()
        .post(`/events/${event.id}/approve`)
        .set('Authorization', as('coordinatorA'))
        .expect(409);
    });

    // TC-S1-05 · setup: base-users + tc-s1-01-setup · fails if a repeated Approve errored or changed the status
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
    // TC-S1-07 · setup: base-users + tc-s1-01-setup (fresh before each of 20 iterations) · fails if approve and reject can both succeed, or the final status contradicts the decision that won
    // Fixed in 61401ec; regression test for audit gap #2
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
    // TC-S1-06 · setup: base-users + tc-s1-01-setup · fails if a Coordinator could approve an event assigned to someone else
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

    it('refuses to approve an unassigned request from the pool', async () => {
      await given('tc-s1-02-setup');
      const event = EVENT.unassigned;

      const res = await http()
        .post(`/events/${event.id}/approve`)
        .set('Authorization', as('coordinatorB'))
        .expect(409);

      expect(res.body.message).toMatch(/assign a coordinator/i);
    });

    it('approves once that request has been assigned (US-10 then US-07)', async () => {
      await given('tc-s1-02-setup');
      const event = EVENT.unassigned;

      await http()
        .patch(`/events/${event.id}/coordinator`)
        .set('Authorization', as('coordinatorB'))
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

    // TC-S1-06 · setup: base-users + tc-s1-01-setup · fails if an Organiser or Attendee could approve
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

    it('refuses an unauthenticated caller', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await http().post(`/events/${event.id}/approve`).expect(401);
    });
  });
});
