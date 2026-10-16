import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-08 e2e — reject and return as distinct decisions.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql; each test then loads the tc-s1 script its
 * test case names (see docs/testing/sprint1-test-cases.md).
 */
describe('US-08 reject / return with a mandatory reason (e2e)', () => {
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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
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

  describe('AC-1: reject and return are separate actions', () => {
    // TC-S1-08 · setup: base-users + tc-s1-02-setup · fails if Reject and Return produced the same outcome
    it('reject and return are different endpoints with different outcomes', async () => {
      await given('tc-s1-02-setup');
      const toReject = EVENT.submitted;
      const toReturn = EVENT.submitted2;

      const rejected = await http()
        .post(`/events/${toReject.id}/reject`)
        .set('Authorization', as('coordinatorA'))
        .send({ reason: 'Clashes with the examination period' })
        .expect(200);

      const returned = await http()
        .post(`/events/${toReturn.id}/return`)
        .set('Authorization', as('coordinatorA'))
        .send({ reason: 'Please confirm the attendance figure' })
        .expect(200);

      expect(rejected.body.status).toBe(EventStatus.REJECTED);
      expect(returned.body.status).toBe(EventStatus.RETURNED);
      expect(rejected.body.status).not.toBe(returned.body.status);
    });

    // TC-S1-13 · setup: base-users + tc-s1-01-setup · fails if a rejected request could still be edited
    it('rejecting does not leave the request amendable', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await http()
        .post(`/events/${event.id}/reject`)
        .set('Authorization', as('coordinatorA'))
        .send({ reason: 'No' })
        .expect(200);

      await http()
        .patch(`/events/${event.id}`)
        .set('Authorization', as('organiser'))
        .send({ purpose: 'Trying to edit' })
        .expect(409);
    });

    it('returning does leave the request amendable', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await http()
        .post(`/events/${event.id}/return`)
        .set('Authorization', as('coordinatorA'))
        .send({ reason: 'Please add more detail' })
        .expect(200);

      await http()
        .patch(`/events/${event.id}`)
        .set('Authorization', as('organiser'))
        .send({ purpose: 'Now with more detail' })
        .expect(200);
    });

    // TC-S1-13 · setup: base-users + tc-s1-01-setup · fails if a rejection could be overturned by a Return
    it('a rejected request cannot then be returned', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await http()
        .post(`/events/${event.id}/reject`)
        .set('Authorization', as('coordinatorA'))
        .send({ reason: 'No' })
        .expect(200);

      await http()
        .post(`/events/${event.id}/return`)
        .set('Authorization', as('coordinatorA'))
        .send({ reason: 'Changed my mind' })
        .expect(409);
    });
  });

  describe('AC-2: a reason is mandatory', () => {
    // TC-S1-09 · setup: base-users + tc-s1-01-setup · fails if a decision was accepted without a reason
    it.each(['reject', 'return'])(
      '%s is blocked when the reason is missing',
      async (action) => {
        await given('tc-s1-01-setup');
        const event = EVENT.submitted;

        const res = await http()
          .post(`/events/${event.id}/${action}`)
          .set('Authorization', as('coordinatorA'))
          .send({})
          .expect(400);

        expect((res.body.message as string[]).join(' | ')).toMatch(
          new RegExp(`a reason is required to ${action}`),
        );

        const stored = await prisma.eventRequest.findUniqueOrThrow({
          where: { id: event.id },
        });
        expect(stored.status).toBe(EventStatus.SUBMITTED);
      },
    );

    // TC-S1-10 · setup: base-users + tc-s1-01-setup · fails if an empty reason was accepted
    it.each(['reject', 'return'])(
      '%s is blocked when the reason is an empty string',
      async (action) => {
        await given('tc-s1-01-setup');
        const event = EVENT.submitted;

        await http()
          .post(`/events/${event.id}/${action}`)
          .set('Authorization', as('coordinatorA'))
          .send({ reason: '' })
          .expect(400);

        const stored = await prisma.eventRequest.findUniqueOrThrow({
          where: { id: event.id },
        });
        expect(stored.status).toBe(EventStatus.SUBMITTED);
      },
    );

    // TC-S1-11 · setup: base-users + tc-s1-01-setup · fails if a whitespace-only reason is accepted again
    // Fixed in 93316fa; regression test for audit gap #1
    it.each(['reject', 'return'])(
      '%s is blocked when the reason is whitespace-only',
      async (action) => {
        await given('tc-s1-01-setup');
        const event = EVENT.submitted;

        await http()
          .post(`/events/${event.id}/${action}`)
          .set('Authorization', as('coordinatorA'))
          .send({ reason: '   ' })
          .expect(400);

        const stored = await prisma.eventRequest.findUniqueOrThrow({
          where: { id: event.id },
        });
        expect(stored.status).toBe(EventStatus.SUBMITTED);
        expect(stored.decisionReason).toBeNull();
        expect(stored.clarificationRequest).toBeNull();
      },
    );

    // TC-S1-09 · setup: base-users + tc-s1-01-setup · fails if a refused decision still wrote a status or reason
    it('nothing is written when the reason is missing', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await http()
        .post(`/events/${event.id}/reject`)
        .set('Authorization', as('coordinatorA'))
        .send({})
        .expect(400);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.decisionReason).toBeNull();
      expect(stored.status).toBe(EventStatus.SUBMITTED);
    });
  });

  describe('AC-3: status updates accordingly', () => {
    it('reject sets REJECTED', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await http()
        .post(`/events/${event.id}/reject`)
        .set('Authorization', as('coordinatorA'))
        .send({ reason: 'Clashes with the examination period' })
        .expect(200);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.status).toBe(EventStatus.REJECTED);
    });

    it('return sets RETURNED', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await http()
        .post(`/events/${event.id}/return`)
        .set('Authorization', as('coordinatorA'))
        .send({ reason: 'Please confirm the attendance figure' })
        .expect(200);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.status).toBe(EventStatus.RETURNED);
    });

    it('both work from UNDER_REVIEW', async () => {
      await given('tc-s1-02-setup');
      const a = EVENT.underReview;
      const b = EVENT.underReview2;

      await http()
        .post(`/events/${a.id}/reject`)
        .set('Authorization', as('coordinatorA'))
        .send({ reason: 'No' })
        .expect(200);
      await http()
        .post(`/events/${b.id}/return`)
        .set('Authorization', as('coordinatorA'))
        .send({ reason: 'More detail' })
        .expect(200);
    });

    it('refuses to reject a DRAFT', async () => {
      await given('tc-s1-02-setup');
      const event = EVENT.draft;

      await http()
        .post(`/events/${event.id}/reject`)
        .set('Authorization', as('coordinatorA'))
        .send({ reason: 'No' })
        .expect(409);
    });
  });

  describe('AC-4: the decision and reason are retained and surfaced', () => {
    // TC-S1-12 · setup: base-users + tc-s1-01-setup · fails if the rejection reason was not saved or not shown to the Organiser
    it('shows the rejection reason in the Organiser’s view (US-05 AC-2)', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await http()
        .post(`/events/${event.id}/reject`)
        .set('Authorization', as('coordinatorA'))
        .send({ reason: 'Clashes with the examination period' })
        .expect(200);

      const mine = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(mine.body[0].status).toBe(EventStatus.REJECTED);
      expect(mine.body[0].decisionReason).toBe(
        'Clashes with the examination period',
      );
    });

    // TC-S1-12 · setup: base-users + tc-s1-01-setup · fails if the return reason was not saved or not shown
    it('shows the return reason as an outstanding clarification (US-05 AC-3)', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await http()
        .post(`/events/${event.id}/return`)
        .set('Authorization', as('coordinatorA'))
        .send({ reason: 'Please confirm the attendance figure' })
        .expect(200);

      const mine = await http()
        .get(`/events/mine/${event.id}`)
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(mine.body.status).toBe(EventStatus.RETURNED);
      expect(mine.body.clarificationRequested).toBe(true);
      expect(mine.body.clarificationRequest).toMatch(/attendance figure/);
    });

    // TC-S1-12 · setup: base-users + tc-s1-01-setup · fails if the reason was lost after the first read
    it('retains the reason across later reads', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await http()
        .post(`/events/${event.id}/reject`)
        .set('Authorization', as('coordinatorA'))
        .send({ reason: 'Venue capacity insufficient' })
        .expect(200);

      const first = await http()
        .get(`/events/mine/${event.id}`)
        .set('Authorization', as('organiser'))
        .expect(200);
      const second = await http()
        .get(`/events/mine/${event.id}`)
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(first.body.decisionReason).toBe('Venue capacity insufficient');
      expect(second.body.decisionReason).toBe('Venue capacity insufficient');
    });

    it('a rejection clears an earlier clarification', async () => {
      await given('tc-s1-02-setup');
      const event = EVENT.withQuestion;

      await http()
        .post(`/events/${event.id}/reject`)
        .set('Authorization', as('coordinatorA'))
        .send({ reason: 'No longer viable' })
        .expect(200);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.clarificationRequest).toBeNull();
      expect(stored.decisionReason).toBe('No longer viable');
    });
  });

  describe('the return round trip', () => {
    it('returns, is amended, resubmitted and then approved', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await http()
        .post(`/events/${event.id}/return`)
        .set('Authorization', as('coordinatorA'))
        .send({ reason: 'Please confirm the attendance figure' })
        .expect(200);

      await http()
        .patch(`/events/${event.id}`)
        .set('Authorization', as('organiser'))
        .send({ expectedAttendance: 400 })
        .expect(200);

      await http()
        .post(`/events/${event.id}/submit`)
        .set('Authorization', as('organiser'))
        .expect(200);

      const resubmitted = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(resubmitted.status).toBe(EventStatus.SUBMITTED);
      expect(resubmitted.expectedAttendance).toBe(400);

      await http()
        .post(`/events/${event.id}/approve`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      const approved = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(approved.status).toBe(EventStatus.APPROVED);
      // Approval clears the stale question (US-07).
      expect(approved.clarificationRequest).toBeNull();
    });
  });

  describe('assignment ownership and role', () => {
    // TC-S1-14 · setup: base-users + tc-s1-01-setup · fails if a Coordinator could decide another Coordinator's event
    it.each(['reject', 'return'])(
      '%s refuses a Coordinator assigned elsewhere',
      async (action) => {
        await given('tc-s1-01-setup');
        const event = EVENT.submitted;

        await http()
          .post(`/events/${event.id}/${action}`)
          .set('Authorization', as('coordinatorB'))
          .send({ reason: 'Not mine to decide' })
          .expect(404);
      },
    );

    it('refuses to decide an unassigned request from the pool', async () => {
      await given('tc-s1-02-setup');
      const event = EVENT.unassigned;

      await http()
        .post(`/events/${event.id}/reject`)
        .set('Authorization', as('coordinatorB'))
        .send({ reason: 'No' })
        .expect(409);
    });

    // TC-S1-14 · setup: base-users + tc-s1-01-setup · fails if an Organiser or Attendee could reject
    it.each(['organiser', 'attendee'])('refuses %s at the role gate', async (who) => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await http()
        .post(`/events/${event.id}/reject`)
        .set('Authorization', as(who))
        .send({ reason: 'Trying it on' })
        .expect(403);
    });

    it('refuses an unauthenticated caller', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await http()
        .post(`/events/${event.id}/return`)
        .send({ reason: 'No token' })
        .expect(401);
    });
  });
});
