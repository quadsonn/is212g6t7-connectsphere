import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';

/** US-08 e2e — reject and return as distinct decisions. */
describe('US-08 reject / return with a mandatory reason (e2e)', () => {
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

  describe('AC-1: reject and return are separate actions', () => {
    it('reject and return are different endpoints with different outcomes', async () => {
      const toReject = await seedEvent({ name: 'To reject' });
      const toReturn = await seedEvent({ name: 'To return' });

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

    it('rejecting does not leave the request amendable', async () => {
      const event = await seedEvent();

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
      const event = await seedEvent();

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

    it('a rejected request cannot then be returned', async () => {
      const event = await seedEvent();

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
    it.each(['reject', 'return'])(
      '%s is blocked when the reason is missing',
      async (action) => {
        const event = await seedEvent();

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

    it.each(['reject', 'return'])(
      '%s is blocked when the reason is empty or whitespace-only',
      async (action) => {
        const event = await seedEvent();

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

    it('nothing is written when the reason is missing', async () => {
      const event = await seedEvent();

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
      const event = await seedEvent();

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
      const event = await seedEvent();

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
      const a = await seedEvent({ status: EventStatus.UNDER_REVIEW });
      const b = await seedEvent({ status: EventStatus.UNDER_REVIEW });

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
      const event = await seedEvent({ status: EventStatus.DRAFT });

      await http()
        .post(`/events/${event.id}/reject`)
        .set('Authorization', as('coordinatorA'))
        .send({ reason: 'No' })
        .expect(409);
    });
  });

  describe('AC-4: the decision and reason are retained and surfaced', () => {
    it('shows the rejection reason in the Organiser’s view (US-05 AC-2)', async () => {
      const event = await seedEvent();

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

    it('shows the return reason as an outstanding clarification (US-05 AC-3)', async () => {
      const event = await seedEvent();

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

    it('retains the reason across later reads', async () => {
      const event = await seedEvent();

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
      const event = await seedEvent({
        clarificationRequest: 'An earlier question',
      });

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
      const event = await seedEvent();

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
    it.each(['reject', 'return'])(
      '%s refuses a Coordinator assigned elsewhere',
      async (action) => {
        const event = await seedEvent({ coordinatorId: ids.coordinatorA });

        await http()
          .post(`/events/${event.id}/${action}`)
          .set('Authorization', as('coordinatorB'))
          .send({ reason: 'Not mine to decide' })
          .expect(404);
      },
    );

    it('refuses to decide an unassigned request from the pool', async () => {
      const event = await seedEvent({ coordinatorId: null });

      await http()
        .post(`/events/${event.id}/reject`)
        .set('Authorization', as('coordinatorB'))
        .send({ reason: 'No' })
        .expect(409);
    });

    it.each(['organiser', 'attendee'])('refuses %s at the role gate', async (who) => {
      const event = await seedEvent();

      await http()
        .post(`/events/${event.id}/reject`)
        .set('Authorization', as(who))
        .send({ reason: 'Trying it on' })
        .expect(403);
    });

    it('refuses an unauthenticated caller', async () => {
      const event = await seedEvent();

      await http()
        .post(`/events/${event.id}/return`)
        .send({ reason: 'No token' })
        .expect(401);
    });
  });
});
