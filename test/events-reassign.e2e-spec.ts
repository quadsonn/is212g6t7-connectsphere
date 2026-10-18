import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, NotificationType, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';

/** US-26 e2e — reassign an event when the Coordinator's availability changes. */
describe('US-26 reassign an event to another Coordinator (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const seedUser = async (key: string, email: string, role: Role, name = key) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  const seedEvent = async (overrides: Record<string, unknown> = {}) =>
    prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        coordinatorId: ids.marcus,
        name: 'Freshman Orientation 2030',
        purpose: 'Welcome new students',
        description: 'Full-day programme',
        category: 'Student engagement',
        proposedStart: new Date('2030-10-01T09:00:00Z'),
        proposedEnd: new Date('2030-10-01T17:00:00Z'),
        expectedAttendance: 320,
        status: EventStatus.PLANNING,
        ...overrides,
      },
    });

  const reassign = (eventId: string, coordinatorId: string, who = 'marcus') =>
    http()
      .post(`/events/${eventId}/reassign`)
      .set('Authorization', as(who))
      .send({ coordinatorId });

  const candidates = (eventId: string, who = 'marcus') =>
    http()
      .get(`/events/${eventId}/reassignment-candidates`)
      .set('Authorization', as(who));

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

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
    await seedUser('marcus', 'marcus@example.com', Role.EVENT_COORDINATOR, 'Marcus');
    await seedUser('fatima', 'fatima@example.com', Role.EVENT_COORDINATOR, 'Fatima');
    await seedUser('venueStaff', 'venue@example.com', Role.VENUE_STAFF);
  });

  describe('AC-1: a new Coordinator can be selected', () => {
    it('lists the other Coordinators, not the requester', async () => {
      const event = await seedEvent();

      const res = await candidates(event.id).expect(200);

      expect(res.body).toEqual([
        { id: ids.fatima, name: 'Fatima', email: 'fatima@example.com' },
      ]);
    });

    it('refuses a Coordinator who is not responsible for the event', async () => {
      const event = await seedEvent();

      await candidates(event.id, 'fatima').expect(403);
      await reassign(event.id, ids.fatima, 'fatima').expect(403);
    });

    it('refuses other roles', async () => {
      const event = await seedEvent();

      for (const who of ['organiser', 'venueStaff']) {
        await candidates(event.id, who).expect(403);
        await reassign(event.id, ids.fatima, who).expect(403);
      }
    });

    it('refuses a finished event', async () => {
      const event = await seedEvent({ status: EventStatus.COMPLETED });

      await reassign(event.id, ids.fatima).expect(409);
    });
  });

  describe('AC-2: the assigned Coordinator is updated', () => {
    it('hands the event to the selected Coordinator', async () => {
      const event = await seedEvent();

      const res = await reassign(event.id, ids.fatima).expect(200);

      expect(res.body.coordinator).toEqual({
        id: ids.fatima,
        name: 'Fatima',
        email: 'fatima@example.com',
      });
      const stored = await prisma.eventRequest.findUniqueOrThrow({ where: { id: event.id } });
      expect(stored.coordinatorId).toBe(ids.fatima);
      expect(stored.status).toBe(EventStatus.PLANNING);
    });

    it('moves the event between the two Coordinators’ queues', async () => {
      const event = await seedEvent();
      await reassign(event.id, ids.fatima).expect(200);

      await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('fatima'))
        .expect(200);
      await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('marcus'))
        .expect(404);
    });

    it('rejects reassigning to yourself', async () => {
      const event = await seedEvent();

      await reassign(event.id, ids.marcus).expect(400);
    });

    it('rejects a user who is not a Coordinator', async () => {
      const event = await seedEvent();

      await reassign(event.id, ids.organiser).expect(400);
    });

    it('requires a coordinatorId', async () => {
      const event = await seedEvent();

      await http()
        .post(`/events/${event.id}/reassign`)
        .set('Authorization', as('marcus'))
        .send({})
        .expect(400);
    });
  });

  describe('AC-3: both Coordinators are notified', () => {
    it('creates a notification for the previous and the new Coordinator', async () => {
      const event = await seedEvent();

      await reassign(event.id, ids.fatima).expect(200);

      const notes = await prisma.notification.findMany({
        where: { relatedEventId: event.id, type: NotificationType.EVENT_REASSIGNED },
      });
      expect(notes.map((n) => n.recipientId).sort()).toEqual([ids.marcus, ids.fatima].sort());
    });

    it('notifies nobody when the reassignment is refused', async () => {
      const event = await seedEvent();

      await reassign(event.id, ids.fatima, 'fatima').expect(403);

      expect(await prisma.notification.count()).toBe(0);
    });
  });

  describe('AC-4: the reassignment is in the change history', () => {
    it('shows who handed it over, from whom, to whom', async () => {
      const event = await seedEvent();
      await reassign(event.id, ids.fatima).expect(200);

      // The new Coordinator can now read the history, including this entry.
      const res = await http()
        .get(`/events/${event.id}/history`)
        .set('Authorization', as('fatima'))
        .expect(200);

      expect(res.body.entries).toHaveLength(1);
      expect(res.body.entries[0]).toMatchObject({
        changes: [{ field: 'coordinator', previous: 'Marcus', next: 'Fatima' }],
        changedBy: { id: ids.marcus, name: 'Marcus' },
        requiresReview: false,
      });
    });
  });
});
