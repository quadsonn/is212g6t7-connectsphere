import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, NotificationType, PrismaClient, Role } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-09 (Request clarification from the Organiser through the system),
 * integration tests: the real Nest app over HTTP (Supertest) and the local test
 * database, one describe per acceptance criterion. Code under test:
 * POST /events/:id/clarifications -> askClarification() (AWAITING_CLARIFICATION,
 * notifies the Organiser) and POST /events/:id/clarifications/responses ->
 * respondToClarification() (UNDER_REVIEW, notifies the Coordinator), both
 * through claimForDecision() and setStatus(); the thread is ClarificationMessage.
 * The "US-58" block at the end is a Sprint 4 story's tests, kept here.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql; each test then loads the tc-s1 script its
 * test case names (see docs/testing/sprint1-test-cases.md).
 */
describe('US-09 clarification thread (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';

  /** Fixed rows from base-users.sql. */
  const USERS = {
    organiser: { id: 'USR-006', email: 'organiser@example.com' },
    coordinatorA: { id: 'USR-004', email: 'coord.a@example.com' },
    coordinatorB: { id: 'USR-005', email: 'coord.b@example.com' },
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

  const ask = (eventId: string, question: string, who = 'coordinatorA') =>
    http()
      .post(`/events/${eventId}/clarifications`)
      .set('Authorization', as(who))
      .send({ question });

  const respond = (eventId: string, response: string, who = 'organiser') =>
    http()
      .post(`/events/${eventId}/clarifications/responses`)
      .set('Authorization', as(who))
      .send({ response });

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

  describe('AC-1: a text field is available for the question', () => {
    // TC-S1-18 · US-09 AC-1 · setup: base-users + tc-s1-01-setup · fails if a whitespace-only question is accepted (regression for audit gap #1)
    // Code: @Trim() runs before @IsNotEmpty, so "   " is refused with 400 (fixed in 93316fa).
    it('rejects a whitespace-only question', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      const res = await ask(event.id, '   ').expect(400);

      expect((res.body.message as string[]).join(' | ')).toMatch(/a question is required/);
      expect(await prisma.clarificationMessage.count()).toBe(0);
      const stored = await prisma.eventRequest.findUniqueOrThrow({ where: { id: event.id } });
      expect(stored.status).toBe(EventStatus.SUBMITTED);
      expect(stored.clarificationRequest).toBeNull();
    });

    // TC-S1-16 · US-09 AC-1 · setup: base-users + tc-s1-01-setup · fails if a free-text question was refused or not stored
    // Code: POST /events/:id/clarifications (AskClarificationDto: question @Trim @IsNotEmpty) ->
    // askClarification() stores it as a ClarificationMessage.
    it('accepts a free-text question', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      const res = await ask(event.id, 'Can you confirm the expected attendance?').expect(201);

      expect(res.body.clarificationRequest).toBe(
        'Can you confirm the expected attendance?',
      );
    });

    // TC-S1-17 · US-09 AC-1 · setup: base-users + tc-s1-01-setup · fails if an empty question was accepted
    // Code: @IsNotEmpty answers 400 "a question is required to request clarification".
    it('requires the question to be non-empty', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      const res = await ask(event.id, '').expect(400);
      expect((res.body.message as string[]).join(' | ')).toMatch(
        /a question is required/,
      );
    });

    // TC-S1-17 · US-09 AC-1 · setup: base-users + tc-s1-01-setup · fails if a request with no question was accepted
    // Code: a body without question fails the same @IsNotEmpty check (400).
    it('rejects a missing question entirely', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await http()
        .post(`/events/${event.id}/clarifications`)
        .set('Authorization', as('coordinatorA'))
        .send({})
        .expect(400);
    });
  });

  describe('AC-2: the question is tied to its event request', () => {
    // TC-S1-16 · US-09 AC-2 · setup: base-users + tc-s1-01-setup · fails if the question was not tied to its event request
    // Code: askClarification() creates the ClarificationMessage with eventId and authorId in the
    // same transaction.
    it('stores the message against the event', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await ask(event.id, 'Which venue did you have in mind?').expect(201);

      const messages = await prisma.clarificationMessage.findMany({
        where: { eventId: event.id },
      });
      expect(messages).toHaveLength(1);
      expect(messages[0].body).toBe('Which venue did you have in mind?');
      expect(messages[0].authorId).toBe(ids.coordinatorA);
    });

    // TC-S1-16 · US-09 AC-2 · setup: base-users + tc-s1-01-setup · fails if one request's questions appeared on another's thread
    // Code: the thread is read by eventId, so each request has its own.
    it('keeps threads on separate events apart', async () => {
      await given('tc-s1-02-setup');
      const a = EVENT.submitted;
      const b = EVENT.submitted2;

      await ask(a.id, 'Question about A').expect(201);
      await ask(b.id, 'Question about B').expect(201);

      const forA = await prisma.clarificationMessage.findMany({
        where: { eventId: a.id },
      });
      expect(forA).toHaveLength(1);
      expect(forA[0].body).toBe('Question about A');
    });
  });

  describe('AC-3: status becomes AWAITING_CLARIFICATION for both parties', () => {
    // TC-S1-19 · US-09 AC-3 · setup: base-users + tc-s1-01-setup · fails if asking did not move the request to AWAITING_CLARIFICATION
    // Code: askClarification() calls setStatus(AWAITING_CLARIFICATION) inside the transaction,
    // after claimForDecision().
    it('updates the stored status', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await ask(event.id, 'Q?').expect(201);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.status).toBe(EventStatus.AWAITING_CLARIFICATION);
    });

    // TC-S1-19 · US-09 AC-3, US-05 AC-3 · setup: base-users + tc-s1-01-setup · fails if the Organiser could not see that clarification is needed
    // Code: the Organiser's statusView reports AWAITING_CLARIFICATION with the question.
    it('is visible to the Organiser', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;
      await ask(event.id, 'Can you confirm the attendance?').expect(201);

      const res = await http()
        .get(`/events/mine/${event.id}`)
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body.status).toBe(EventStatus.AWAITING_CLARIFICATION);
      expect(res.body.clarificationRequested).toBe(true);
      expect(res.body.clarificationRequest).toMatch(/attendance/);
    });

    // TC-S1-19 · US-09 AC-3 · setup: base-users + tc-s1-01-setup · fails if the Coordinator view showed a stale status
    // Code: GET /events/assigned/:id reads the same row.
    it('is visible to the Coordinator', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;
      await ask(event.id, 'Q?').expect(201);

      const res = await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      expect(res.body.status).toBe(EventStatus.AWAITING_CLARIFICATION);
    });

    // TC-S1-19 · US-09 AC-3 · setup: base-users + tc-s1-01-setup · fails if a question could be asked on a request never submitted
    // Code: DRAFT -> AWAITING_CLARIFICATION is not an edge in the status machine, so 409.
    it('refuses to ask on a DRAFT', async () => {
      await given('tc-s1-02-setup');
      const event = EVENT.draft;

      await ask(event.id, 'Q?').expect(409);
    });
  });

  describe('AC-4: the other party is notified', () => {
    // TC-S1-20 · US-09 AC-4 (the other direction), with US-39 · setup: base-users + tc-s1-01-setup · fails if the Organiser was not told a question is waiting
    // Code: askClarification() calls notifySafely(CLARIFICATION_REQUESTED) for the Organiser after
    // the commit.
    it('notifies the Organiser when a question is asked', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await ask(event.id, 'Q?').expect(201);

      const notes = await prisma.notification.findMany({
        where: { recipientId: ids.organiser },
      });
      expect(notes).toHaveLength(1);
      expect(notes[0].type).toBe(NotificationType.CLARIFICATION_REQUESTED);
      expect(notes[0].relatedEventId).toBe(event.id);
    });

    // TC-S1-20 · US-09 AC-4 · setup: base-users + tc-s1-01-setup · fails if no notification was recorded for the Coordinator
    // Code: respondToClarification() calls notifySafely(CLARIFICATION_ANSWERED) for the assigned
    // Coordinator.
    it('notifies the Coordinator when the Organiser responds', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;
      await ask(event.id, 'Q?').expect(201);

      await respond(event.id, 'We expect 320 attendees').expect(201);

      const notes = await prisma.notification.findMany({
        where: { recipientId: ids.coordinatorA },
      });
      expect(notes).toHaveLength(1);
      expect(notes[0].type).toBe(NotificationType.CLARIFICATION_ANSWERED);
      expect(notes[0].relatedEventId).toBe(event.id);
    });

    // TC-S1-20 · US-09 AC-4 · setup: base-users + tc-s1-01-setup · fails if the Coordinator's inbox did not show the answer, or not as unread
    // Code: GET /notifications (NotificationsInboxService.list) and /notifications/unread-count
    // read the caller's own notifications.
    it('shows the answer in the Coordinator’s notifications inbox, unread', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;
      await ask(event.id, 'Q?').expect(201);
      await respond(event.id, 'We expect 320 attendees').expect(201);

      const inbox = await http().get('/notifications').set('Authorization', as('coordinatorA')).expect(200);
      const count = await http().get('/notifications/unread-count').set('Authorization', as('coordinatorA')).expect(200);

      expect(inbox.body).toEqual([
        expect.objectContaining({ type: NotificationType.CLARIFICATION_ANSWERED, read: false }),
      ]);
      expect(JSON.stringify(inbox.body[0])).toContain(event.id);
      expect(count.body).toEqual({ unread: 1 });
    });

    // TC-S1-20 · US-09 AC-4 · setup: base-users + tc-s1-01-setup · fails if a new notification were stored as already read
    // Code: notifications are created with read = false and a createdAt timestamp.
    it('records notifications unread, for a future feed to consume', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;
      await ask(event.id, 'Q?').expect(201);

      const note = await prisma.notification.findFirstOrThrow({
        where: { recipientId: ids.organiser },
      });
      expect(note.read).toBe(false);
      expect(note.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('the response path', () => {
    // TC-S1-19 · US-09 AC-4, US-11 AC-3 · setup: base-users + tc-s1-01-setup · fails if answering left the request awaiting clarification
    // Code: respondToClarification() calls setStatus(UNDER_REVIEW): the answer is now the
    // Coordinator's to review.
    it('returns the request to UNDER_REVIEW', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;
      await ask(event.id, 'Q?').expect(201);

      await respond(event.id, 'Answer').expect(201);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.status).toBe(EventStatus.UNDER_REVIEW);
      expect(stored.clarificationRequest).toBeNull();
    });

    // TC-S1-87 · US-09 AC-4 · setup: base-users + tc-s1-01-setup · fails if an Organiser could "answer" a question nobody asked
    // Code: respondToClarification() refuses unless the request is AWAITING_CLARIFICATION (409).
    it('refuses a response when nothing was asked', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await respond(event.id, 'Unprompted').expect(409);
    });

    // TC-S1-22 · US-09 AC-4, US-02 AC-5 · setup: base-users + tc-s1-01-setup + tc-s1-22-setup · fails if an Organiser could answer on someone else's request
    // Code: assertEventAccess(CLARIFY) under OWN scope finds no row, so 404.
    it('refuses a response from another Organiser', async () => {
      await given('tc-s1-01-setup', 'tc-s1-22-setup');
      const event = EVENT.submitted;
      const login = await http()
        .post('/auth/login')
        .send({ email: 'other@example.com', password: PASSWORD })
        .expect(200);
      tokens.otherOrganiser = login.body.accessToken;
      await ask(event.id, 'Q?').expect(201);

      await respond(event.id, 'Not mine', 'otherOrganiser').expect(404);
    });

    // TC-S1-87 · US-09 AC-4 · setup: base-users + tc-s1-01-setup · fails if an empty answer was accepted
    // Code: RespondClarificationDto: response @Trim @IsNotEmpty (400).
    it('refuses an empty response', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;
      await ask(event.id, 'Q?').expect(201);

      await respond(event.id, '').expect(400);
    });

    // TC-S1-63 · US-09 AC-4 · setup: base-users + tc-s1-01-setup (fresh before each of 20 iterations) · fails if two simultaneous responses to one question both succeed
    // Code: respondToClarification() starts with claimForDecision() (row lock while still
    // AWAITING_CLARIFICATION); the second gets 409 (audit gap #3).
    it('accepts exactly one of two simultaneous responses to the same question', async () => {
      const ITERATIONS = 20;
      const violations: string[] = [];

      for (let i = 1; i <= ITERATIONS; i++) {
        await resetDb(prisma);
        await loadSql(prisma, 'base-users');
        await given('tc-s1-01-setup');
        const event = EVENT.submitted;
        await ask(event.id, 'Which room layout do you need?').expect(201);

        const [first, second] = await Promise.all([
          respond(event.id, 'Theatre style'),
          respond(event.id, 'Boardroom style'),
        ]);
        const stored = await prisma.eventRequest.findUniqueOrThrow({ where: { id: event.id } });
        const answers = await prisma.clarificationMessage.count({
          where: { eventId: event.id, authorId: ids.organiser },
        });
        const notified = await prisma.notification.count({
          where: {
            recipientId: ids.coordinatorA,
            type: NotificationType.CLARIFICATION_ANSWERED,
          },
        });

        const statuses = [first.status, second.status].sort();
        if (
          statuses[0] !== 201 ||
          statuses[1] !== 409 ||
          stored.status !== EventStatus.UNDER_REVIEW ||
          answers !== 1 ||
          notified !== 1
        ) {
          violations.push(
            `iteration ${i}: responses ${first.status}/${second.status}, stored ${stored.status}, answers ${answers}, notifications ${notified}`,
          );
        }
      }

      expect(violations).toEqual([]);
    });
  });

  describe('AC-5: a timestamped audit trail with sender and time', () => {
    // TC-S1-21 · US-09 AC-5 · setup: base-users + tc-s1-01-setup · fails if a question or answer was missing from the trail
    // Code: the Organiser's view includes every ClarificationMessage of the event.
    it('shows the full exchange to the Organiser', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;
      await ask(event.id, 'Q1: how many attendees?').expect(201);
      await respond(event.id, 'A1: 320').expect(201);
      await ask(event.id, 'Q2: any accessibility needs?').expect(201);
      await respond(event.id, 'A2: hearing loop').expect(201);

      const res = await http()
        .get(`/events/mine/${event.id}`)
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body.clarifications).toHaveLength(4);
      expect(res.body.clarifications.map((m: { body: string }) => m.body)).toEqual([
        'Q1: how many attendees?',
        'A1: 320',
        'Q2: any accessibility needs?',
        'A2: hearing loop',
      ]);
    });

    // TC-S1-21 · US-09 AC-5 · setup: base-users + tc-s1-01-setup · fails if the Coordinator saw a different trail
    // Code: the Coordinator's view reads the same messages.
    it('shows the same exchange to the Coordinator', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;
      await ask(event.id, 'Q1').expect(201);
      await respond(event.id, 'A1').expect(201);

      const res = await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      expect(res.body.clarifications).toHaveLength(2);
    });

    // TC-S1-21 · US-09 AC-5 · setup: base-users + tc-s1-01-setup · fails if an entry lost its sender
    // Code: each message is returned with its author (id, name, role).
    it('identifies the sender of each entry', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;
      await ask(event.id, 'Q1').expect(201);
      await respond(event.id, 'A1').expect(201);

      const res = await http()
        .get(`/events/mine/${event.id}`)
        .set('Authorization', as('organiser'))
        .expect(200);

      const [question, answer] = res.body.clarifications;
      expect(question.author).toMatchObject({
        id: ids.coordinatorA,
        role: Role.EVENT_COORDINATOR,
        email: 'coord.a@example.com',
      });
      expect(answer.author).toMatchObject({
        id: ids.organiser,
        role: Role.EVENT_ORGANISER,
      });
    });

    // TC-S1-21 · US-09 AC-5 · setup: base-users + tc-s1-01-setup · fails if entries were untimestamped or out of order
    // Code: messages are ordered by createdAt ascending, each with its createdAt.
    it('timestamps every entry, in chronological order', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;
      await ask(event.id, 'Q1').expect(201);
      await respond(event.id, 'A1').expect(201);
      await ask(event.id, 'Q2').expect(201);

      const res = await http()
        .get(`/events/mine/${event.id}`)
        .set('Authorization', as('organiser'))
        .expect(200);

      const times = res.body.clarifications.map((m: { createdAt: string }) =>
        new Date(m.createdAt).getTime(),
      );
      expect(times).toHaveLength(3);
      for (const t of times) expect(Number.isNaN(t)).toBe(false);
      expect([...times]).toEqual([...times].sort((a, b) => a - b));
    });

    // TC-S1-21 · US-09 AC-5 · setup: base-users + tc-s1-01-setup · fails if answering removed or replaced the question
    // Code: both sides only ever create messages; none is updated or deleted.
    it('is append-only — an answered question stays in the trail', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;
      await ask(event.id, 'Q1').expect(201);
      await respond(event.id, 'A1').expect(201);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      // The outstanding-question shortcut is cleared...
      expect(stored.clarificationRequest).toBeNull();

      // ...but the history is intact.
      const messages = await prisma.clarificationMessage.findMany({
        where: { eventId: event.id },
      });
      expect(messages).toHaveLength(2);
    });
  });

  describe('permissions', () => {
    // TC-S1-22 · US-09 AC-2, US-02 AC-6 · setup: base-users + tc-s1-01-setup + tc-s1-22-setup · fails if an unassigned Coordinator could ask a question
    // Code: assertEventAccess(CLARIFY) under ASSIGNED scope finds no row, so 404.
    it('refuses a Coordinator who is not assigned', async () => {
      await given('tc-s1-01-setup', 'tc-s1-22-setup');
      const event = EVENT.submitted;

      await ask(event.id, 'Q?', 'coordinatorB').expect(404);
    });

    // TC-S1-22 · US-09 AC-1, US-02 AC-3 · setup: base-users + tc-s1-01-setup · fails if an Organiser could post a Coordinator's question
    // Code: POST /events/:id/clarifications is @Roles(EVENT_COORDINATOR); RolesGuard answers 403.
    it('refuses an Organiser trying to ask', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await http()
        .post(`/events/${event.id}/clarifications`)
        .set('Authorization', as('organiser'))
        .send({ question: 'Asking my own question' })
        .expect(403);
    });

    // TC-S1-22 · US-09 AC-4, US-02 AC-3 · setup: base-users + tc-s1-01-setup · fails if a Coordinator could answer their own question
    // Code: POST /events/:id/clarifications/responses is @Roles(EVENT_ORGANISER), so 403.
    it('refuses a Coordinator trying to respond', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;
      await ask(event.id, 'Q?').expect(201);

      await http()
        .post(`/events/${event.id}/clarifications/responses`)
        .set('Authorization', as('coordinatorA'))
        .send({ response: 'Answering my own question' })
        .expect(403);
    });

    // TC-S1-22 · US-09, US-02 AC-8 · setup: base-users + tc-s1-01-setup · fails if questions or answers could be posted without signing in
    // Code: JwtAuthGuard answers 401 on both routes.
    it('refuses unauthenticated callers', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await http()
        .post(`/events/${event.id}/clarifications`)
        .send({ question: 'Q?' })
        .expect(401);
    });
  });

  // The US-58 tests have no test case ID yet (none in docs/testing for them).
  // Each starts from tc-s1-01-setup's submitted request (EVT-146, 320 expected).
  describe('US-58: responding with updated details', () => {
    const respondWith = (
      eventId: string,
      body: { response: string; changes?: Record<string, unknown> },
      who = 'organiser',
    ) =>
      http()
        .post(`/events/${eventId}/clarifications/responses`)
        .set('Authorization', as(who))
        .send(body);

    /** tc-s1-01-setup's SUBMITTED request, as stored. */
    const submittedEvent = async () => {
      await given('tc-s1-01-setup');
      return prisma.eventRequest.findUniqueOrThrow({ where: { id: EVENT.submitted.id } });
    };

    const awaitingEvent = async () => {
      const event = await submittedEvent();
      await ask(event.id, 'How many will attend, and how will they leave?').expect(201);
      return event;
    };

    const stored = (eventId: string) =>
      prisma.eventRequest.findUniqueOrThrow({ where: { id: eventId } });

    const thread = async (eventId: string) =>
      (await http().get(`/events/mine/${eventId}`).set('Authorization', as('organiser')).expect(200))
        .body.clarifications;

    // TC-S4-58 · US-58 AC-1 · setup: base-users + tc-s1-01-setup · fails if the Organiser cannot see which requests await clarification, or the question is not shown on the request
    // Code: EventsService.findMyRequests / findMyRequest (status, clarificationRequested, clarificationRequest)
    it('AC1: Given a question was asked, Then the request shows as awaiting clarification with the question', async () => {
      const event = await awaitingEvent();

      const res = await http().get(`/events/mine/${event.id}`).set('Authorization', as('organiser')).expect(200);

      expect(res.body.status).toBe('AWAITING_CLARIFICATION');
      expect(res.body.clarificationRequest).toBe('How many will attend, and how will they leave?');

      // And in the Organiser's list of requests, so they can see which ones are waiting.
      const list = await http().get('/events/mine').set('Authorization', as('organiser')).expect(200);
      expect(list.body.find((e: { id: string }) => e.id === event.id)).toMatchObject({
        status: 'AWAITING_CLARIFICATION',
        clarificationRequested: true,
      });
    });

    // TC-S4-59, TC-S4-60, TC-S4-61, TC-S4-62 · US-58 AC-2/AC-3/AC-4/AC-5 · setup: base-users + tc-s1-01-setup · fails if a response with changes is not saved, its changes are not shown old -> new under the question, or the request does not return for review
    // Code: EventsService.respondToClarification -> applyEdits (EventChange), setStatus(UNDER_REVIEW)
    it('AC3/AC4/AC5: Given changes, When the Organiser responds, Then they are saved, shown old -> new on the response, and the request returns for review', async () => {
      const event = await awaitingEvent();

      await respondWith(event.id, {
        response: 'About 400, and we added a second exit.',
        changes: { expectedAttendance: 400, layoutNotes: 'Second exit at the rear' },
      }).expect(201);

      const after = await stored(event.id);
      expect(after.expectedAttendance).toBe(400);
      expect(after.layoutNotes).toBe('Second exit at the rear');
      expect(after.status).toBe(EventStatus.UNDER_REVIEW);

      const [question, answer] = await thread(event.id);
      expect(question.change).toBeNull();
      expect(answer.body).toBe('About 400, and we added a second exit.');
      expect(answer.change.changes).toEqual([
        { field: 'expectedAttendance', previous: 320, next: 400 },
        { field: 'layoutNotes', previous: null, next: 'Second exit at the rear' },
      ]);

      // The same edit is in the event's history, once.
      expect(await prisma.eventChange.count({ where: { eventId: event.id } })).toBe(1);
    });

    // TC-S4-61 · US-58 AC-4 · setup: base-users + tc-s1-01-setup · fails if the Coordinator cannot see the response's changes in the thread
    // Code: EventsService.findAssignedRequest (clarifications with change)
    it('AC4: the Coordinator sees the response and its changes in the thread too', async () => {
      const event = await awaitingEvent();
      await respondWith(event.id, { response: 'About 400.', changes: { expectedAttendance: 400 } }).expect(201);

      const res = await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      expect(res.body.clarifications[1].change.changes).toEqual([
        { field: 'expectedAttendance', previous: 320, next: 400 },
      ]);
    });

    // TC-S4-64 · US-58 AC-7 · setup: base-users + tc-s1-01-setup · fails if an invalid detail is saved, or the status or thread changes
    // Code: RespondClarificationDto changes validated like an edit; respondToClarification (one transaction)
    it('Given a field update that fails validation, Then 400, nothing is saved, and the status does not change', async () => {
      const event = await awaitingEvent();

      await respondWith(event.id, {
        response: 'New times.',
        changes: { proposedStart: '2030-10-01T17:00:00Z', proposedEnd: '2030-10-01T09:00:00Z' },
      }).expect(400);

      const after = await stored(event.id);
      expect(after.proposedStart).toEqual(event.proposedStart);
      expect(after.status).toBe(EventStatus.AWAITING_CLARIFICATION);
      expect(await thread(event.id)).toHaveLength(1);
    });

    // TC-S4-60, TC-S4-64 · US-58 AC-3/AC-7 · setup: base-users + tc-s1-01-setup · fails if clearing a required field gives a server error or saves anything
    // Code: RespondClarificationDto / event-change.rules (required fields)
    it('Given a change that clears a required field, Then 400 rather than a server error, and nothing is saved', async () => {
      const event = await awaitingEvent();

      const res = await respondWith(event.id, { response: 'No name.', changes: { name: null } }).expect(400);

      expect(JSON.stringify(res.body.message)).toMatch(/name/i);
      const after = await stored(event.id);
      expect(after.name).toBe(event.name);
      expect(after.status).toBe(EventStatus.AWAITING_CLARIFICATION);
    });

    // TC-S4-59 · US-58 AC-2 · setup: base-users + tc-s1-01-setup + tc-s1-22-setup · fails if another Organiser can respond to, or change, the request
    // Code: EventsService.respondToClarification (own requests only, 404)
    it('Given another Organiser’s event, When they respond with changes, Then 404 and nothing is saved', async () => {
      const event = await awaitingEvent();
      // tc-s1-22-setup: a second Organiser, unrelated to the request.
      await given('tc-s1-22-setup');
      const login = await http()
        .post('/auth/login')
        .send({ email: 'other@example.com', password: PASSWORD })
        .expect(200);
      tokens.otherOrganiser = login.body.accessToken;

      await respondWith(event.id, { response: 'Mine now.', changes: { expectedAttendance: 5 } }, 'otherOrganiser').expect(404);

      expect((await stored(event.id)).expectedAttendance).toBe(320);
    });

    // TC-S4-59 · US-58 AC-2 · setup: base-users + tc-s1-01-setup · fails if a response is accepted, or details change, when no question is waiting
    // Code: EventsService.respondToClarification (AWAITING_CLARIFICATION only, 409)
    it('Given the request is not awaiting clarification, When the Organiser responds with changes, Then 409 and nothing is saved', async () => {
      const event = await submittedEvent();

      await respondWith(event.id, { response: 'Unprompted.', changes: { expectedAttendance: 400 } }).expect(409);

      expect((await stored(event.id)).expectedAttendance).toBe(320);
    });

    // TC-S4-63 · US-58 AC-6 · setup: base-users + tc-s1-01-setup · fails if a whitespace-only response is accepted, or its changes are saved
    // Code: RespondClarificationDto (trimmed, @IsNotEmpty)
    it('AC6: Given a whitespace-only response, Then 400 and nothing changes', async () => {
      const event = await awaitingEvent();

      await respondWith(event.id, { response: '   ', changes: { expectedAttendance: 400 } }).expect(400);

      const after = await stored(event.id);
      expect(after.expectedAttendance).toBe(320);
      expect(after.status).toBe(EventStatus.AWAITING_CLARIFICATION);
    });

    // TC-S4-62 · US-58 AC-5 · setup: base-users + tc-s1-01-setup · fails if two simultaneous responses are both accepted
    // Code: EventsService.respondToClarification (SELECT … FOR UPDATE on the request)
    it('Given two responses at once, Then exactly one is accepted', async () => {
      const event = await awaitingEvent();

      const results = await Promise.all([
        respondWith(event.id, { response: 'First.', changes: { expectedAttendance: 400 } }),
        respondWith(event.id, { response: 'Second.', changes: { expectedAttendance: 500 } }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await thread(event.id)).toHaveLength(2);
    });

    // TC-S4-61 · US-58 AC-4 · setup: base-users + tc-s1-01-setup · fails if a later response loses or mixes up an earlier response's changes
    // Code: clarification thread: each response linked to its own EventChange
    it('Given a second round, Then each response keeps its own changes', async () => {
      const event = await awaitingEvent();
      await respondWith(event.id, { response: 'About 400.', changes: { expectedAttendance: 400 } }).expect(201);
      await ask(event.id, 'And the layout?').expect(201);
      await respondWith(event.id, { response: 'Banquet.', changes: { preferredLayout: 'BANQUET' } }).expect(201);

      const entries = await thread(event.id);
      expect(entries.map((e: { change: { changes: { field: string }[] } | null }) => e.change?.changes.map((c) => c.field) ?? null)).toEqual([
        null,
        ['expectedAttendance'],
        null,
        ['preferredLayout'],
      ]);
    });

    // TC-S4-62 · US-58 AC-5 · setup: base-users + tc-s1-01-setup · fails if the assigned Coordinator is not told, or not told what changed
    // Code: EventsService.respondToClarification -> notifySafely (CLARIFICATION_ANSWERED)
    it('Given changes, Then the Coordinator’s notification names the updated details', async () => {
      const event = await awaitingEvent();

      await respondWith(event.id, { response: 'About 400.', changes: { expectedAttendance: 400 } }).expect(201);

      const note = await prisma.notification.findFirstOrThrow({
        where: { relatedEventId: event.id, type: NotificationType.CLARIFICATION_ANSWERED },
      });
      expect(note.message).toBe(
        `The organiser has responded on "${event.name}" and updated: expected attendance.`,
      );
    });
  });
});
