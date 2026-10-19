import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { listenOnLoopback } from './listen-on-loopback';

/** US-05 e2e — one describe per acceptance criterion. */
describe('US-05 organiser views status of own requests (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const completeFields = {
    name: 'Freshman Orientation 2030',
    purpose: 'Welcome new students',
    description: 'Full-day programme',
    category: 'Student engagement',
    proposedStart: '2030-10-01T09:00:00.000Z',
    proposedEnd: '2030-10-01T17:00:00.000Z',
    expectedAttendance: 300,
  };

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: key, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  /**
   * Creates a request directly in the database at a given status.
   *
   * US-05 is read-only and owns no transition logic, and the Coordinator
   * review endpoints that would set these fields do not exist yet — so the
   * fixtures are seeded rather than driven through the API.
   */
  const seedRequest = async (
    organiserKey: string,
    overrides: Record<string, unknown> = {},
  ) => {
    return prisma.eventRequest.create({
      data: {
        organiserId: ids[organiserKey],
        name: 'Seeded request',
        purpose: 'Purpose',
        description: 'Description',
        category: 'Conference',
        proposedStart: new Date('2030-10-01T09:00:00Z'),
        proposedEnd: new Date('2030-10-01T17:00:00Z'),
        expectedAttendance: 100,
        ...overrides,
      },
    });
  };

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
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();

    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('otherOrganiser', 'other@example.com', Role.EVENT_ORGANISER);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);
  });

  describe('AC-1: each request shows its current status', () => {
    it('reports every status in the lifecycle', async () => {
      for (const status of Object.values(EventStatus)) {
        await seedRequest('organiser', { name: `Request ${status}`, status });
      }

      const res = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);

      const byName = Object.fromEntries(
        res.body.map((e: { name: string; status: string }) => [e.name, e.status]),
      );

      for (const status of Object.values(EventStatus)) {
        expect(byName[`Request ${status}`]).toBe(status);
      }
    });

    it('returns an empty list when the Organiser has none', async () => {
      const res = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('refuses a non-Organiser', async () => {
      await http()
        .get('/events/mine')
        .set('Authorization', as('coordinator'))
        .expect(403);
    });

    it('refuses an unauthenticated caller', async () => {
      await http().get('/events/mine').expect(401);
    });
  });

  describe('AC-2: a rejected request shows the Coordinator’s reason', () => {
    it('includes decisionReason on a rejected request', async () => {
      await seedRequest('organiser', {
        status: EventStatus.REJECTED,
        decisionReason: 'Clashes with the examination period',
      });

      const res = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body[0].status).toBe(EventStatus.REJECTED);
      expect(res.body[0].decisionReason).toBe('Clashes with the examination period');
    });

    it('includes it when opening the request directly', async () => {
      const seeded = await seedRequest('organiser', {
        status: EventStatus.REJECTED,
        decisionReason: 'Venue capacity insufficient',
      });

      const res = await http()
        .get(`/events/mine/${seeded.id}`)
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body.decisionReason).toBe('Venue capacity insufficient');
    });
  });

  describe('AC-3: clarification is shown, with the question', () => {
    it('flags clarification and shows what is asked', async () => {
      await seedRequest('organiser', {
        status: EventStatus.DRAFT,
        clarificationRequest: 'Please confirm the expected attendance figure',
      });

      const res = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body[0].clarificationRequested).toBe(true);
      expect(res.body[0].clarificationRequest).toMatch(/expected attendance/);
    });

    it('distinguishes a returned request from an ordinary draft', async () => {
      await seedRequest('organiser', { name: 'Plain draft', status: EventStatus.DRAFT });
      await seedRequest('organiser', {
        name: 'Returned for clarification',
        status: EventStatus.DRAFT,
        clarificationRequest: 'Which venue did you have in mind?',
      });

      const res = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);

      const byName = Object.fromEntries(
        res.body.map((e: { name: string; clarificationRequested: boolean }) => [
          e.name,
          e.clarificationRequested,
        ]),
      );

      expect(byName['Plain draft']).toBe(false);
      expect(byName['Returned for clarification']).toBe(true);
    });

    it('reports no clarification when none was asked', async () => {
      await seedRequest('organiser', { status: EventStatus.SUBMITTED });

      const res = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body[0].clarificationRequested).toBe(false);
      expect(res.body[0].clarificationRequest).toBeNull();
    });
  });

  describe('AC-4: the displayed status is the most recent valid state', () => {
    it('reflects a transition made through the real submit endpoint', async () => {
      const created = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send(completeFields)
        .expect(201);

      const before = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);
      expect(before.body[0].status).toBe(EventStatus.DRAFT);

      await http()
        .post(`/events/${created.body.id}/submit`)
        .set('Authorization', as('organiser'))
        .expect(200);

      const after = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);
      expect(after.body[0].status).toBe(EventStatus.SUBMITTED);
    });

    it('reflects a later submitted -> under review change', async () => {
      const seeded = await seedRequest('organiser', { status: EventStatus.SUBMITTED });

      await prisma.eventRequest.update({
        where: { id: seeded.id },
        data: { status: EventStatus.UNDER_REVIEW },
      });

      const res = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body[0].status).toBe(EventStatus.UNDER_REVIEW);
    });

    it('does not serve a stale status on a repeated read', async () => {
      const seeded = await seedRequest('organiser', { status: EventStatus.APPROVED });

      await http().get('/events/mine').set('Authorization', as('organiser')).expect(200);

      await prisma.eventRequest.update({
        where: { id: seeded.id },
        data: { status: EventStatus.PLANNING },
      });

      const res = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body[0].status).toBe(EventStatus.PLANNING);
    });
  });

  describe('AC-5: another Organiser’s requests never appear', () => {
    it('excludes them from the list', async () => {
      await seedRequest('organiser', { name: 'Mine' });
      await seedRequest('otherOrganiser', { name: 'Theirs' });

      const res = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Mine');
    });

    it('denies fetching another Organiser’s request by id', async () => {
      const theirs = await seedRequest('otherOrganiser', { name: 'Theirs' });

      const res = await http()
        .get(`/events/mine/${theirs.id}`)
        .set('Authorization', as('organiser'))
        .expect(404);

      expect(res.body.name).toBeUndefined();
    });

    it('does not leak a rejection reason belonging to someone else', async () => {
      const theirs = await seedRequest('otherOrganiser', {
        status: EventStatus.REJECTED,
        decisionReason: 'CONFIDENTIAL internal note',
      });

      const list = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);
      expect(JSON.stringify(list.body)).not.toMatch(/CONFIDENTIAL/);

      const single = await http()
        .get(`/events/mine/${theirs.id}`)
        .set('Authorization', as('organiser'))
        .expect(404);
      expect(JSON.stringify(single.body)).not.toMatch(/CONFIDENTIAL/);
    });
  });

  describe('route resolution', () => {
    it('does not treat "mine" as an event id', async () => {
      // GET /events/mine is declared before GET /events/:id; if that order
      // ever changes this returns 404 instead of the list.
      await seedRequest('organiser');

      const res = await http()
        .get('/events/mine')
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
