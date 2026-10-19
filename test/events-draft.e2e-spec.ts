import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { listenOnLoopback } from './listen-on-loopback';

/** US-04 e2e — one describe per acceptance criterion. */
describe('US-04 save event request as draft (e2e)', () => {
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

  describe('AC-1: saves without full submission validation, at DRAFT', () => {
    it('accepts a completely empty draft', async () => {
      const res = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({})
        .expect(201);

      expect(res.body.status).toBe(EventStatus.DRAFT);
      expect(res.body.id).toEqual(expect.any(String));
    });

    it('accepts a draft with required fields still empty', async () => {
      const res = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({ name: 'Work in progress' })
        .expect(201);

      expect(res.body.status).toBe(EventStatus.DRAFT);
      expect(res.body.name).toBe('Work in progress');
      expect(res.body.purpose).toBeNull();
      expect(res.body.expectedAttendance).toBeNull();
    });

    it('accepts a date in the past, which submission would reject', async () => {
      await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({
          proposedStart: '2020-01-01T09:00:00.000Z',
          proposedEnd: '2020-01-01T17:00:00.000Z',
        })
        .expect(201);
    });

    it('still rejects incoherent data', async () => {
      await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({ expectedAttendance: 'not a number' })
        .expect(400);

      await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({
          proposedStart: '2030-10-01T17:00:00.000Z',
          proposedEnd: '2030-10-01T09:00:00.000Z',
        })
        .expect(400);
    });

    it('refuses a non-Organiser', async () => {
      await http()
        .post('/events/drafts')
        .set('Authorization', as('coordinator'))
        .send({})
        .expect(403);
    });

    it('refuses an unauthenticated caller', async () => {
      await http().post('/events/drafts').send({}).expect(401);
    });
  });

  describe('AC-2: returning later to continue editing', () => {
    it('opens the saved draft with what was entered', async () => {
      const created = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({ name: 'Half done', purpose: 'Partly written' })
        .expect(201);

      const reopened = await http()
        .get(`/events/${created.body.id}`)
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(reopened.body).toMatchObject({
        name: 'Half done',
        purpose: 'Partly written',
        status: EventStatus.DRAFT,
      });
    });

    it('fills in the missing fields incrementally', async () => {
      const created = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({ name: 'Half done' })
        .expect(201);

      await http()
        .patch(`/events/${created.body.id}`)
        .set('Authorization', as('organiser'))
        .send({ purpose: 'Added on the second visit' })
        .expect(200);

      const after = await http()
        .get(`/events/${created.body.id}`)
        .set('Authorization', as('organiser'))
        .expect(200);

      // The earlier value survived the partial edit.
      expect(after.body.name).toBe('Half done');
      expect(after.body.purpose).toBe('Added on the second visit');
    });

    it('refuses to edit another Organiser’s draft', async () => {
      const created = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({ name: 'Mine' })
        .expect(201);

      await http()
        .patch(`/events/${created.body.id}`)
        .set('Authorization', as('otherOrganiser'))
        .send({ name: 'Hijacked' })
        .expect(404);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      expect(stored.name).toBe('Mine');
    });
  });

  describe('AC-3: drafts are distinguishable in the list', () => {
    it('marks a draft DRAFT and a submitted request SUBMITTED', async () => {
      await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({ name: 'Still a draft' })
        .expect(201);

      await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(completeFields)
        .expect(201);

      const list = await http()
        .get('/events')
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(list.body).toHaveLength(2);

      const byName = Object.fromEntries(
        list.body.map((e: { name: string; status: string }) => [e.name, e.status]),
      );
      expect(byName['Still a draft']).toBe(EventStatus.DRAFT);
      expect(byName['Freshman Orientation 2030']).toBe(EventStatus.SUBMITTED);
    });

    it('keeps drafts out of the Coordinator review queue', async () => {
      await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({ name: 'Still a draft' })
        .expect(201);

      const queue = await http()
        .get('/events')
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(queue.body).toHaveLength(0);
    });
  });

  describe('AC-4: a completed draft submits via the transition method', () => {
    it('moves DRAFT -> SUBMITTED', async () => {
      const created = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send(completeFields)
        .expect(201);

      expect(created.body.status).toBe(EventStatus.DRAFT);

      const submitted = await http()
        .post(`/events/${created.body.id}/submit`)
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(submitted.body.status).toBe(EventStatus.SUBMITTED);
    });

    it('keeps it out of every Coordinator’s view once submitted, until the Lead assigns it', async () => {
      const created = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send(completeFields)
        .expect(201);

      await http()
        .post(`/events/${created.body.id}/submit`)
        .set('Authorization', as('organiser'))
        .expect(200);

      const queue = await http()
        .get('/events')
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(queue.body).toHaveLength(0);
    });

    it('blocks submitting an incomplete draft and flags each missing field', async () => {
      const created = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({ name: 'Only a name' })
        .expect(201);

      const res = await http()
        .post(`/events/${created.body.id}/submit`)
        .set('Authorization', as('organiser'))
        .expect(400);

      const messages = (res.body.message as string[]).join(' | ');
      expect(messages).toMatch(/purpose/);
      expect(messages).toMatch(/category/);
      expect(messages).toMatch(/expectedAttendance/);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      expect(stored.status).toBe(EventStatus.DRAFT);
    });

    it('blocks submitting a draft whose date has since passed', async () => {
      const created = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({
          ...completeFields,
          proposedStart: '2020-01-01T09:00:00.000Z',
          proposedEnd: '2020-01-01T17:00:00.000Z',
        })
        .expect(201);

      const res = await http()
        .post(`/events/${created.body.id}/submit`)
        .set('Authorization', as('organiser'))
        .expect(400);

      expect((res.body.message as string[]).join(' | ')).toMatch(
        /proposedStart must be in the future/,
      );
    });

    it('refuses to submit another Organiser’s draft', async () => {
      const created = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send(completeFields)
        .expect(201);

      await http()
        .post(`/events/${created.body.id}/submit`)
        .set('Authorization', as('otherOrganiser'))
        .expect(404);
    });
  });

  describe('AC-5: a submitted request does not behave as a draft', () => {
    const submitOne = async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(completeFields)
        .expect(201);
      return res.body.id as string;
    };

    it('refuses to edit it', async () => {
      const id = await submitOne();

      const res = await http()
        .patch(`/events/${id}`)
        .set('Authorization', as('organiser'))
        .send({ name: 'Changed after submission' })
        .expect(409);

      expect(res.body.message).toMatch(/SUBMITTED/);
    });

    it('leaves the stored record untouched after a refused edit', async () => {
      const id = await submitOne();

      await http()
        .patch(`/events/${id}`)
        .set('Authorization', as('organiser'))
        .send({ name: 'Changed after submission' })
        .expect(409);

      const stored = await prisma.eventRequest.findUniqueOrThrow({ where: { id } });
      expect(stored.name).toBe(completeFields.name);
    });

    it('refuses to submit it again', async () => {
      const id = await submitOne();

      await http()
        .post(`/events/${id}/submit`)
        .set('Authorization', as('organiser'))
        .expect(409);
    });

    it('still shows it, with its status', async () => {
      const id = await submitOne();

      const res = await http()
        .get(`/events/${id}`)
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body.status).toBe(EventStatus.SUBMITTED);
    });
  });
});
