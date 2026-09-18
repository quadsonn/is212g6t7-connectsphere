import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';

/** US-10 e2e — one describe per acceptance criterion. */
describe('US-10 assign a Coordinator (e2e)', () => {
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
        name: 'Freshman Orientation',
        purpose: 'Welcome new students',
        description: 'Full-day programme',
        category: 'Student engagement',
        proposedStart: new Date('2030-10-01T09:00:00Z'),
        proposedEnd: new Date('2030-10-01T17:00:00Z'),
        expectedAttendance: 300,
        status: EventStatus.SUBMITTED,
        ...overrides,
      },
    });

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
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();

    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('coordinatorA', 'coord.a@example.com', Role.EVENT_COORDINATOR);
    await seedUser('coordinatorB', 'coord.b@example.com', Role.EVENT_COORDINATOR);
    await seedUser('attendee', 'attendee@example.com', Role.ATTENDEE);
    await seedUser('venueStaff', 'venue@example.com', Role.VENUE_STAFF);
  });

  describe('AC-1: a Coordinator is linked as main contact', () => {
    it('assigns a Coordinator to a submitted event', async () => {
      const event = await seedEvent();

      const res = await http()
        .patch(`/events/${event.id}/coordinator`)
        .set('Authorization', as('coordinatorA'))
        .send({ coordinatorId: ids.coordinatorB })
        .expect(200);

      expect(res.body.coordinatorId).toBe(ids.coordinatorB);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.coordinatorId).toBe(ids.coordinatorB);
    });

    it('lets a Coordinator claim an unassigned event for themselves', async () => {
      const event = await seedEvent();

      await http()
        .patch(`/events/${event.id}/coordinator`)
        .set('Authorization', as('coordinatorA'))
        .send({ coordinatorId: ids.coordinatorA })
        .expect(200);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.coordinatorId).toBe(ids.coordinatorA);
    });

    it('leaves the status untouched', async () => {
      const event = await seedEvent();

      const res = await http()
        .patch(`/events/${event.id}/coordinator`)
        .set('Authorization', as('coordinatorA'))
        .send({ coordinatorId: ids.coordinatorB })
        .expect(200);

      expect(res.body.status).toBe(EventStatus.SUBMITTED);
    });

    it.each([
      ['organiser', 403],
      ['attendee', 403],
      ['venueStaff', 403],
    ])('refuses %s', async (who, expected) => {
      const event = await seedEvent();

      await http()
        .patch(`/events/${event.id}/coordinator`)
        .set('Authorization', as(who))
        .send({ coordinatorId: ids.coordinatorB })
        .expect(expected);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.coordinatorId).toBeNull();
    });

    it('refuses an unauthenticated caller', async () => {
      const event = await seedEvent();

      await http()
        .patch(`/events/${event.id}/coordinator`)
        .send({ coordinatorId: ids.coordinatorB })
        .expect(401);
    });

    it('rejects an assignee who is not a Coordinator', async () => {
      const event = await seedEvent();

      const res = await http()
        .patch(`/events/${event.id}/coordinator`)
        .set('Authorization', as('coordinatorA'))
        .send({ coordinatorId: ids.attendee })
        .expect(400);

      expect(res.body.message).toMatch(/EVENT_COORDINATOR/);
    });

    it('rejects an unknown assignee', async () => {
      const event = await seedEvent();

      await http()
        .patch(`/events/${event.id}/coordinator`)
        .set('Authorization', as('coordinatorA'))
        .send({ coordinatorId: 'does-not-exist' })
        .expect(404);
    });

    it('rejects a missing coordinatorId', async () => {
      const event = await seedEvent();

      await http()
        .patch(`/events/${event.id}/coordinator`)
        .set('Authorization', as('coordinatorA'))
        .send({})
        .expect(400);
    });

    it('refuses to assign a DRAFT', async () => {
      const event = await seedEvent({ status: EventStatus.DRAFT });

      await http()
        .patch(`/events/${event.id}/coordinator`)
        .set('Authorization', as('coordinatorA'))
        .send({ coordinatorId: ids.coordinatorB })
        .expect(409);
    });

    it('refuses to assign a CANCELLED event', async () => {
      const event = await seedEvent({ status: EventStatus.CANCELLED });

      await http()
        .patch(`/events/${event.id}/coordinator`)
        .set('Authorization', as('coordinatorA'))
        .send({ coordinatorId: ids.coordinatorB })
        .expect(409);
    });
  });

  describe('AC-2: reassignment transfers ownership', () => {
    it('makes the new Coordinator the main contact', async () => {
      const event = await seedEvent({ coordinatorId: ids.coordinatorA });

      await http()
        .patch(`/events/${event.id}/coordinator`)
        .set('Authorization', as('coordinatorB'))
        .send({ coordinatorId: ids.coordinatorB })
        .expect(200);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.coordinatorId).toBe(ids.coordinatorB);
    });

    it('gives the new Coordinator access to the event', async () => {
      const event = await seedEvent({ coordinatorId: ids.coordinatorA });

      await http()
        .patch(`/events/${event.id}/coordinator`)
        .set('Authorization', as('coordinatorA'))
        .send({ coordinatorId: ids.coordinatorB })
        .expect(200);

      await http()
        .get(`/events/${event.id}`)
        .set('Authorization', as('coordinatorB'))
        .expect(200);
    });

    it('removes the previous Coordinator’s ownership', async () => {
      // Seed at a status outside the unassigned review pool, so the only way
      // coordinatorA could still see it is through an assignment link.
      const event = await seedEvent({
        status: EventStatus.PLANNING,
        coordinatorId: ids.coordinatorA,
      });

      await http()
        .get(`/events/${event.id}`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      await http()
        .patch(`/events/${event.id}/coordinator`)
        .set('Authorization', as('coordinatorA'))
        .send({ coordinatorId: ids.coordinatorB })
        .expect(200);

      // Ownership is gone: the event no longer appears, by id or in the list.
      await http()
        .get(`/events/${event.id}`)
        .set('Authorization', as('coordinatorA'))
        .expect(404);

      const list = await http()
        .get('/events')
        .set('Authorization', as('coordinatorA'))
        .expect(200);
      expect(list.body).toHaveLength(0);
    });

    it('is idempotent', async () => {
      const event = await seedEvent({ coordinatorId: ids.coordinatorB });

      await http()
        .patch(`/events/${event.id}/coordinator`)
        .set('Authorization', as('coordinatorA'))
        .send({ coordinatorId: ids.coordinatorB })
        .expect(200);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.coordinatorId).toBe(ids.coordinatorB);
    });
  });

  describe('AC-3: the assigned Coordinator is visible', () => {
    it('shows the Coordinator to the Organiser who raised the request', async () => {
      const event = await seedEvent({ coordinatorId: ids.coordinatorA });

      const res = await http()
        .get(`/events/mine/${event.id}`)
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body.coordinator).toMatchObject({
        id: ids.coordinatorA,
        name: 'coordinatorA',
        email: 'coord.a@example.com',
      });
    });

    it('shows the Coordinator in the Organiser’s list', async () => {
      await seedEvent({ coordinatorId: ids.coordinatorA });

      const res = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body[0].coordinator.email).toBe('coord.a@example.com');
    });

    it('shows the Coordinator to the assigned Coordinator', async () => {
      const event = await seedEvent({ coordinatorId: ids.coordinatorA });

      const res = await http()
        .get(`/events/${event.id}`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      expect(res.body.coordinator.id).toBe(ids.coordinatorA);
    });

    it('reports null when no Coordinator is assigned yet', async () => {
      const event = await seedEvent();

      const res = await http()
        .get(`/events/mine/${event.id}`)
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body.coordinatorId).toBeNull();
      expect(res.body.coordinator).toBeNull();
    });

    it('shows the Coordinator to an Attendee too, alongside the rest of the public view', async () => {
      await seedEvent({
        status: EventStatus.CONFIRMED,
        coordinatorId: ids.coordinatorA,
        registrationEnabled: true,
      });

      const res = await http()
        .get('/events')
        .set('Authorization', as('attendee'))
        .expect(200);

      expect(res.body).toHaveLength(1);
      // The AC says "visible to any authorised user viewing the event" with no
      // role qualifier, so the public projection carries it too — the raw FK
      // and every other internal planning field stay stripped.
      expect(res.body[0].coordinator).toMatchObject({
        id: ids.coordinatorA,
        email: 'coord.a@example.com',
      });
      expect(res.body[0]).not.toHaveProperty('coordinatorId');
      expect(res.body[0]).not.toHaveProperty('organiserId');
    });
  });
});
