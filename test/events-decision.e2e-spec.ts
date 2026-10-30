import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-08 (Reject or return a request with a reason), integration tests: the real Nest app over HTTP
 * (Supertest) and the local test database, one describe per acceptance
 * criterion. Code under test: POST /events/:id/reject and /return (RejectRequestDto,
 * ReturnRequestDto: reason @Trim @IsNotEmpty) -> decide(): assertIsAssignedTo,
 * claimForDecision, setStatus(REJECTED | RETURNED), reason kept on the request.
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
    organiser: { id: 'USR-006', email: 'organiser@example.com' },
    coordinatorA: { id: 'USR-004', email: 'coord.a@example.com' },
    coordinatorB: { id: 'USR-005', email: 'coord.b@example.com' },
    attendee: { id: 'USR-001', email: 'attendee@example.com' },
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

  describe('AC-1: reject and return are separate actions', () => {
    // TC-S1-08 · US-08 AC-1, AC-3 · setup: base-users + tc-s1-02-setup · fails if Reject and Return produced the same outcome
    // Code: POST /events/:id/reject -> REJECTED with decisionReason; POST /events/:id/return ->
    // RETURNED with clarificationRequest (both via decide()).
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

    // TC-S1-13 · US-08 AC-1 · setup: base-users + tc-s1-01-setup · fails if a rejected request could still be edited
    // Code: assertIsEditable() allows only DRAFT and RETURNED, so editing REJECTED is 409.
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

    // TC-S1-08 · US-08 AC-1 · setup: base-users + tc-s1-01-setup · fails if a returned request could not be amended
    // Code: RETURNED is in EDITABLE_STATUSES, so updateDraft() accepts it.
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

    // TC-S1-13 · US-08 AC-1 · setup: base-users + tc-s1-01-setup · fails if a rejection could be overturned by a Return
    // Code: REJECTED -> RETURNED is not an edge in the status machine (409).
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
    // TC-S1-09 · US-08 AC-2 · setup: base-users + tc-s1-01-setup · fails if a decision was accepted without a reason
    // Code: RejectRequestDto / ReturnRequestDto: reason is @IsNotEmpty (400) before decide() runs.
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

    // TC-S1-10 · US-08 AC-2 · setup: base-users + tc-s1-01-setup · fails if an empty reason was accepted
    // Code: @IsNotEmpty refuses "" (400).
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

    // TC-S1-11 · US-08 AC-2 · setup: base-users + tc-s1-01-setup · fails if a whitespace-only reason is accepted again
    // Code: @Trim() runs before @IsNotEmpty, so "   " becomes "" and is refused (audit gap #1,
    // fixed in 93316fa).
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

    // TC-S1-09 · US-08 AC-2 · setup: base-users + tc-s1-01-setup · fails if a refused decision still wrote a status or reason
    // Code: validation fails before decide(), so the row is untouched.
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
    // TC-S1-08 · US-08 AC-3 · setup: base-users + tc-s1-01-setup · fails if Reject did not store REJECTED
    // Code: decide(REJECTED) -> setStatus(REJECTED).
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

    // TC-S1-08 · US-08 AC-3 · setup: base-users + tc-s1-01-setup · fails if Return did not store RETURNED
    // Code: decide(RETURNED) -> setStatus(RETURNED).
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

    // TC-S1-08 · US-08 AC-3 · setup: base-users + tc-s1-02-setup · fails if a request under review could not be rejected or returned
    // Code: the status machine allows UNDER_REVIEW -> REJECTED and -> RETURNED.
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

    // TC-S1-08 · US-08 AC-3 · setup: base-users + tc-s1-02-setup · fails if a draft (never submitted) could be rejected
    // Code: DRAFT -> REJECTED is not an edge, so 409.
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
    // TC-S1-12 · US-08 AC-4, US-05 AC-2 · setup: base-users + tc-s1-01-setup · fails if the rejection reason was not saved or not shown to the Organiser
    // Code: decisionReason is saved with the status and surfaced in statusView.decision.
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

    // TC-S1-12 · US-08 AC-4, US-05 AC-3 · setup: base-users + tc-s1-01-setup · fails if the return reason was not saved or not shown
    // Code: a return's reason is stored as clarificationRequest and surfaced in
    // statusView.clarification.
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

    // TC-S1-12 · US-08 AC-4 · setup: base-users + tc-s1-01-setup · fails if the reason was lost after the first read
    // Code: the reason is a column on the request, not a one-off response field.
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

    // TC-S1-12 · US-08 AC-4 · setup: base-users + tc-s1-01-setup · fails if a rejected request still showed an old clarification question
    // Code: reject() sets clarificationRequest to null with decisionReason.
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
    // TC-S1-08 · US-08 AC-1, AC-3, with US-04 AC-4 and US-07 AC-3 · setup: base-users + tc-s1-01-setup · fails if a returned request could not go round the amend-resubmit-approve loop
    // Code: RETURNED is editable (updateDraft), submitDraft() moves it back to SUBMITTED,
    // approve() to APPROVED.
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
    // TC-S1-14 · US-08 AC-1, US-02 AC-6 · setup: base-users + tc-s1-01-setup · fails if a Coordinator could decide another Coordinator's event
    // Code: assertEventAccess(REVIEW) under ASSIGNED scope finds nothing, so 404.
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

    // TC-S1-14 · US-08 AC-1, US-02 AC-6 · setup: base-users + tc-s1-02-setup · fails if a Coordinator could reject a request nobody assigned to them
    // Code: coordinatorId is NULL, so ASSIGNED scope never matches (Week 7 Change 5).
    it('refuses to decide an unassigned request from the pool', async () => {
      await given('tc-s1-02-setup');
      const event = EVENT.unassigned;

      await http()
        .post(`/events/${event.id}/reject`)
        .set('Authorization', as('coordinatorB'))
        .send({ reason: 'No' })
        .expect(404);
    });

    // TC-S1-14 · US-08 AC-1, US-02 AC-3 · setup: base-users + tc-s1-01-setup · fails if an Organiser or Attendee could reject
    // Code: POST /events/:id/reject is @Roles(EVENT_COORDINATOR); RolesGuard answers 403.
    it.each(['organiser', 'attendee'])('refuses %s at the role gate', async (who) => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await http()
        .post(`/events/${event.id}/reject`)
        .set('Authorization', as(who))
        .send({ reason: 'Trying it on' })
        .expect(403);
    });

    // TC-S1-14 · US-08 AC-1, US-02 AC-8 · setup: base-users + tc-s1-01-setup · fails if a request could be rejected without signing in
    // Code: JwtAuthGuard answers 401.
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
