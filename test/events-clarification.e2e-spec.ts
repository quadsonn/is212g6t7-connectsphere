import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, NotificationType, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { listenOnLoopback } from './listen-on-loopback';

/** US-09 e2e — clarification thread and audit trail. */
describe('US-09 clarification thread (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: key, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  const seedEvent = async (overrides: Record<string, unknown> = {}) =>
    prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        coordinatorId: ids.coordinatorA,
        name: 'Freshman Orientation 2030',
        purpose: 'Welcome new students',
        description: 'Full-day programme',
        category: 'Student engagement',
        proposedStart: new Date('2030-10-01T09:00:00Z'),
        proposedEnd: new Date('2030-10-01T17:00:00Z'),
        expectedAttendance: 320,
        status: EventStatus.SUBMITTED,
        ...overrides,
      },
    });

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
    await listenOnLoopback(app);

    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.clarificationMessage.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();

    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('otherOrganiser', 'other@example.com', Role.EVENT_ORGANISER);
    await seedUser('coordinatorA', 'coord.a@example.com', Role.EVENT_COORDINATOR);
    await seedUser('coordinatorB', 'coord.b@example.com', Role.EVENT_COORDINATOR);
  });

  describe('AC-1: a text field is available for the question', () => {
    it('accepts a free-text question', async () => {
      const event = await seedEvent();

      const res = await ask(event.id, 'Can you confirm the expected attendance?').expect(201);

      expect(res.body.clarificationRequest).toBe(
        'Can you confirm the expected attendance?',
      );
    });

    it('requires the question to be non-empty', async () => {
      const event = await seedEvent();

      const res = await ask(event.id, '').expect(400);
      expect((res.body.message as string[]).join(' | ')).toMatch(
        /a question is required/,
      );
    });

    it('rejects a missing question entirely', async () => {
      const event = await seedEvent();

      await http()
        .post(`/events/${event.id}/clarifications`)
        .set('Authorization', as('coordinatorA'))
        .send({})
        .expect(400);
    });
  });

  describe('AC-2: the question is tied to its event request', () => {
    it('stores the message against the event', async () => {
      const event = await seedEvent();

      await ask(event.id, 'Which venue did you have in mind?').expect(201);

      const messages = await prisma.clarificationMessage.findMany({
        where: { eventId: event.id },
      });
      expect(messages).toHaveLength(1);
      expect(messages[0].body).toBe('Which venue did you have in mind?');
      expect(messages[0].authorId).toBe(ids.coordinatorA);
    });

    it('keeps threads on separate events apart', async () => {
      const a = await seedEvent({ name: 'Event A' });
      const b = await seedEvent({ name: 'Event B' });

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
    it('updates the stored status', async () => {
      const event = await seedEvent();

      await ask(event.id, 'Q?').expect(201);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.status).toBe(EventStatus.AWAITING_CLARIFICATION);
    });

    it('is visible to the Organiser', async () => {
      const event = await seedEvent();
      await ask(event.id, 'Can you confirm the attendance?').expect(201);

      const res = await http()
        .get(`/events/mine/${event.id}`)
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body.status).toBe(EventStatus.AWAITING_CLARIFICATION);
      expect(res.body.clarificationRequested).toBe(true);
      expect(res.body.clarificationRequest).toMatch(/attendance/);
    });

    it('is visible to the Coordinator', async () => {
      const event = await seedEvent();
      await ask(event.id, 'Q?').expect(201);

      const res = await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      expect(res.body.status).toBe(EventStatus.AWAITING_CLARIFICATION);
    });

    it('refuses to ask on a DRAFT', async () => {
      const event = await seedEvent({ status: EventStatus.DRAFT });

      await ask(event.id, 'Q?').expect(409);
    });
  });

  describe('AC-4: the other party is notified', () => {
    it('notifies the Organiser when a question is asked', async () => {
      const event = await seedEvent();

      await ask(event.id, 'Q?').expect(201);

      const notes = await prisma.notification.findMany({
        where: { recipientId: ids.organiser },
      });
      expect(notes).toHaveLength(1);
      expect(notes[0].type).toBe(NotificationType.CLARIFICATION_REQUESTED);
      expect(notes[0].relatedEventId).toBe(event.id);
    });

    it('notifies the Coordinator when the Organiser responds', async () => {
      const event = await seedEvent();
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
      const event = await seedEvent();
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
      const event = await seedEvent();
      await ask(event.id, 'Q?').expect(201);

      await respond(event.id, 'Answer').expect(201);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.status).toBe(EventStatus.UNDER_REVIEW);
      expect(stored.clarificationRequest).toBeNull();
    });

    it('refuses a response when nothing was asked', async () => {
      const event = await seedEvent();

      await respond(event.id, 'Unprompted').expect(409);
    });

    it('refuses a response from another Organiser', async () => {
      const event = await seedEvent();
      await ask(event.id, 'Q?').expect(201);

      await respond(event.id, 'Not mine', 'otherOrganiser').expect(404);
    });

    it('refuses an empty response', async () => {
      const event = await seedEvent();
      await ask(event.id, 'Q?').expect(201);

      await respond(event.id, '').expect(400);
    });
  });

  describe('AC-5: a timestamped audit trail with sender and time', () => {
    it('shows the full exchange to the Organiser', async () => {
      const event = await seedEvent();
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

    it('shows the same exchange to the Coordinator', async () => {
      const event = await seedEvent();
      await ask(event.id, 'Q1').expect(201);
      await respond(event.id, 'A1').expect(201);

      const res = await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      expect(res.body.clarifications).toHaveLength(2);
    });

    it('identifies the sender of each entry', async () => {
      const event = await seedEvent();
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

    it('timestamps every entry, in chronological order', async () => {
      const event = await seedEvent();
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
      const event = await seedEvent();
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
    it('refuses a Coordinator who is not assigned', async () => {
      const event = await seedEvent({ coordinatorId: ids.coordinatorA });

      await ask(event.id, 'Q?', 'coordinatorB').expect(404);
    });

    it('refuses an Organiser trying to ask', async () => {
      const event = await seedEvent();

      await http()
        .post(`/events/${event.id}/clarifications`)
        .set('Authorization', as('organiser'))
        .send({ question: 'Asking my own question' })
        .expect(403);
    });

    it('refuses a Coordinator trying to respond', async () => {
      const event = await seedEvent();
      await ask(event.id, 'Q?').expect(201);

      await http()
        .post(`/events/${event.id}/clarifications/responses`)
        .set('Authorization', as('coordinatorA'))
        .send({ response: 'Answering my own question' })
        .expect(403);
    });

    it('refuses unauthenticated callers', async () => {
      const event = await seedEvent();

      await http()
        .post(`/events/${event.id}/clarifications`)
        .send({ question: 'Q?' })
        .expect(401);
    });
  });
});
