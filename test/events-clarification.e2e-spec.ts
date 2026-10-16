import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, NotificationType, PrismaClient, Role } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-09 e2e — clarification thread and audit trail.
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
    organiser: { id: 'u-organiser', email: 'organiser@example.com' },
    coordinatorA: { id: 'u-coordinator-a', email: 'coord.a@example.com' },
    coordinatorB: { id: 'u-coordinator-b', email: 'coord.b@example.com' },
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

  describe('AC-1: a text field is available for the question', () => {
    // TC-S1-18 · setup: base-users + tc-s1-01-setup · fails if a whitespace-only question is accepted (regression for audit gap #1)
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

    // TC-S1-16 · setup: base-users + tc-s1-01-setup · fails if a free-text question was refused or not stored
    it('accepts a free-text question', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      const res = await ask(event.id, 'Can you confirm the expected attendance?').expect(201);

      expect(res.body.clarificationRequest).toBe(
        'Can you confirm the expected attendance?',
      );
    });

    // TC-S1-17 · setup: base-users + tc-s1-01-setup · fails if an empty question was accepted
    it('requires the question to be non-empty', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      const res = await ask(event.id, '').expect(400);
      expect((res.body.message as string[]).join(' | ')).toMatch(
        /a question is required/,
      );
    });

    // TC-S1-17 · setup: base-users + tc-s1-01-setup · fails if a request with no question was accepted
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
    // TC-S1-16 · setup: base-users + tc-s1-01-setup · fails if the question was not tied to its event request
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
    // TC-S1-19 · setup: base-users + tc-s1-01-setup · fails if asking did not move the request to AWAITING_CLARIFICATION
    it('updates the stored status', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await ask(event.id, 'Q?').expect(201);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.status).toBe(EventStatus.AWAITING_CLARIFICATION);
    });

    // TC-S1-19 · setup: base-users + tc-s1-01-setup · fails if the Organiser could not see that clarification is needed
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

    // TC-S1-19 · setup: base-users + tc-s1-01-setup · fails if the Coordinator view showed a stale status
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

    it('refuses to ask on a DRAFT', async () => {
      await given('tc-s1-02-setup');
      const event = EVENT.draft;

      await ask(event.id, 'Q?').expect(409);
    });
  });

  describe('AC-4: the other party is notified', () => {
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

    // TC-S1-20 · setup: base-users + tc-s1-01-setup · fails if no notification was recorded for the Coordinator
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

    it('refuses a response when nothing was asked', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await respond(event.id, 'Unprompted').expect(409);
    });

    // TC-S1-22 · setup: base-users + tc-s1-01-setup + tc-s1-22-setup · fails if an Organiser could answer on someone else's request
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

    it('refuses an empty response', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;
      await ask(event.id, 'Q?').expect(201);

      await respond(event.id, '').expect(400);
    });
  });

  describe('AC-5: a timestamped audit trail with sender and time', () => {
    // TC-S1-21 · setup: base-users + tc-s1-01-setup · fails if a question or answer was missing from the trail
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

    // TC-S1-21 · setup: base-users + tc-s1-01-setup · fails if the Coordinator saw a different trail
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

    // TC-S1-21 · setup: base-users + tc-s1-01-setup · fails if an entry lost its sender
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

    // TC-S1-21 · setup: base-users + tc-s1-01-setup · fails if entries were untimestamped or out of order
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
    // TC-S1-22 · setup: base-users + tc-s1-01-setup + tc-s1-22-setup · fails if an unassigned Coordinator could ask a question
    it('refuses a Coordinator who is not assigned', async () => {
      await given('tc-s1-01-setup', 'tc-s1-22-setup');
      const event = EVENT.submitted;

      await ask(event.id, 'Q?', 'coordinatorB').expect(404);
    });

    it('refuses an Organiser trying to ask', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await http()
        .post(`/events/${event.id}/clarifications`)
        .set('Authorization', as('organiser'))
        .send({ question: 'Asking my own question' })
        .expect(403);
    });

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

    it('refuses unauthenticated callers', async () => {
      await given('tc-s1-01-setup');
      const event = EVENT.submitted;

      await http()
        .post(`/events/${event.id}/clarifications`)
        .send({ question: 'Q?' })
        .expect(401);
    });
  });
});
