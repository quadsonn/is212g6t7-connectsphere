import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';

/** US-07 e2e — one describe per acceptance criterion. */
describe('US-07 coordinator reviews and approves (e2e)', () => {
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
        description: 'Full-day programme with talks and booths',
        category: 'Student engagement',
        proposedStart: new Date('2030-10-01T09:00:00Z'),
        proposedEnd: new Date('2030-10-01T17:00:00Z'),
        expectedAttendance: 320,
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
  });

  describe('AC-1: current status is displayed', () => {
    it.each([
      EventStatus.DRAFT,
      EventStatus.SUBMITTED,
      EventStatus.UNDER_REVIEW,
      EventStatus.APPROVED,
      EventStatus.REJECTED,
    ])('shows %s', async (status) => {
      const event = await seedEvent({ status });

      const res = await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      expect(res.body.status).toBe(status);
    });

    it('shows a returned request with its outstanding question', async () => {
      // US-08 made RETURNED a status in its own right.
      const event = await seedEvent({
        status: EventStatus.RETURNED,
        clarificationRequest: 'Please confirm the attendance figure',
      });

      const res = await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      expect(res.body.status).toBe(EventStatus.RETURNED);
      expect(res.body.clarificationRequested).toBe(true);
      expect(res.body.clarificationRequest).toMatch(/attendance/);
    });

    it('does not mark an ordinary draft as returned', async () => {
      const event = await seedEvent({ status: EventStatus.DRAFT });

      const res = await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      expect(res.body.clarificationRequested).toBe(false);
    });
  });

  describe('AC-2: all details are displayed', () => {
    it('returns name, purpose, description and proposed date & time', async () => {
      const event = await seedEvent();

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
    it('moves a submitted request to APPROVED', async () => {
      const event = await seedEvent();

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
      const event = await seedEvent({ status: EventStatus.UNDER_REVIEW });

      await http()
        .post(`/events/${event.id}/approve`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.status).toBe(EventStatus.APPROVED);
    });

    it('is visible to the Organiser afterwards', async () => {
      const event = await seedEvent();

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

    it('refuses to approve a DRAFT', async () => {
      const event = await seedEvent({ status: EventStatus.DRAFT });

      await http()
        .post(`/events/${event.id}/approve`)
        .set('Authorization', as('coordinatorA'))
        .expect(409);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.status).toBe(EventStatus.DRAFT);
    });

    it('refuses to approve a CANCELLED request', async () => {
      const event = await seedEvent({ status: EventStatus.CANCELLED });

      await http()
        .post(`/events/${event.id}/approve`)
        .set('Authorization', as('coordinatorA'))
        .expect(409);
    });

    it('is idempotent — approving twice leaves it APPROVED', async () => {
      const event = await seedEvent();

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
      const event = await seedEvent({
        status: EventStatus.SUBMITTED,
        clarificationRequest: 'An earlier question',
        decisionReason: 'An earlier rejection',
      });

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

  describe('assignment ownership and role', () => {
    it('refuses a Coordinator assigned to a different event', async () => {
      const event = await seedEvent({ coordinatorId: ids.coordinatorA });

      await http()
        .post(`/events/${event.id}/approve`)
        .set('Authorization', as('coordinatorB'))
        .expect(404);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.status).toBe(EventStatus.SUBMITTED);
    });

    it('refuses to approve a request still in the Lead’s unassigned queue', async () => {
      const event = await seedEvent({ coordinatorId: null });

      await http()
        .post(`/events/${event.id}/approve`)
        .set('Authorization', as('coordinatorB'))
        .expect(404);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.status).toBe(EventStatus.SUBMITTED);
    });

    it('approves once that request has been assigned', async () => {
      const event = await seedEvent({ coordinatorId: ids.coordinatorB });

      await http()
        .post(`/events/${event.id}/approve`)
        .set('Authorization', as('coordinatorB'))
        .expect(200);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.status).toBe(EventStatus.APPROVED);
    });

    it.each(['organiser', 'attendee'])('refuses %s at the role gate', async (who) => {
      const event = await seedEvent();

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
      const event = await seedEvent();

      await http().post(`/events/${event.id}/approve`).expect(401);
    });
  });
});
