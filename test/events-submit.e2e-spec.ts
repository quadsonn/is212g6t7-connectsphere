import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';

/** US-03 e2e — one describe per acceptance criterion. */
describe('US-03 submit new event request (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  /** A submission far enough in the future to stay valid as the suite ages. */
  const validPayload = (overrides: Record<string, unknown> = {}) => ({
    name: 'Freshman Orientation 2030',
    purpose: 'Welcome new students and introduce campus services',
    description: 'Full-day programme with talks, booths and a closing social',
    category: 'Student engagement',
    proposedStart: '2030-10-01T09:00:00.000Z',
    proposedEnd: '2030-10-01T17:00:00.000Z',
    expectedAttendance: 300,
    ...overrides,
  });

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
    await seedUser('otherOrganiser', 'other@example.com', Role.EVENT_ORGANISER);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);
    await seedUser('attendee', 'attendee@example.com', Role.ATTENDEE);
  });

  describe('AC-1: a complete, valid request is recorded as SUBMITTED', () => {
    it('returns 201 with status SUBMITTED', async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(validPayload())
        .expect(201);

      expect(res.body.status).toBe(EventStatus.SUBMITTED);
      expect(res.body.id).toEqual(expect.any(String));
    });

    it('persists the record against the calling organiser', async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(validPayload())
        .expect(201);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(stored.status).toBe(EventStatus.SUBMITTED);
      expect(stored.organiserId).toBe(ids.organiser);
    });

    it('ignores a client-supplied organiserId or status', async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send({
          ...validPayload(),
          organiserId: ids.otherOrganiser,
          status: EventStatus.APPROVED,
        })
        .expect(201);

      expect(res.body.organiserId).toBe(ids.organiser);
      expect(res.body.status).toBe(EventStatus.SUBMITTED);
    });

    it('refuses a non-Organiser (@Roles enforcement)', async () => {
      for (const who of ['coordinator', 'attendee']) {
        await http()
          .post('/events')
          .set('Authorization', as(who))
          .send(validPayload())
          .expect(403);
      }
      expect(await prisma.eventRequest.count()).toBe(0);
    });

    it('refuses an unauthenticated submission', async () => {
      await http().post('/events').send(validPayload()).expect(401);
      expect(await prisma.eventRequest.count()).toBe(0);
    });
  });

  describe('AC-2: confirmation, and visibility to Coordinators', () => {
    it('returns the persisted request as confirmation', async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(validPayload())
        .expect(201);

      expect(res.body).toMatchObject({
        name: 'Freshman Orientation 2030',
        category: 'Student engagement',
        expectedAttendance: 300,
        status: EventStatus.SUBMITTED,
      });
      expect(res.body.createdAt).toEqual(expect.any(String));
    });

    it('makes the request visible to a Coordinator for review', async () => {
      await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(validPayload())
        .expect(201);

      const queue = await http()
        .get('/events')
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(queue.body).toHaveLength(1);
      expect(queue.body[0].name).toBe('Freshman Orientation 2030');
      expect(queue.body[0].status).toBe(EventStatus.SUBMITTED);
    });

    it('does not expose it to a different Organiser', async () => {
      await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(validPayload())
        .expect(201);

      const others = await http()
        .get('/events')
        .set('Authorization', as('otherOrganiser'))
        .expect(200);

      expect(others.body).toHaveLength(0);
    });
  });

  describe('AC-3: invalid input is blocked and each field flagged', () => {
    const messagesFor = async (payload: Record<string, unknown>) => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(payload)
        .expect(400);
      return (res.body.message as string[]).join(' | ');
    };

    it('rejects a date in the past', async () => {
      const messages = await messagesFor(
        validPayload({
          proposedStart: '2020-01-01T09:00:00.000Z',
          proposedEnd: '2020-01-01T17:00:00.000Z',
        }),
      );
      expect(messages).toMatch(/proposedStart must be in the future/);
    });

    it('rejects non-numeric attendance', async () => {
      const messages = await messagesFor(
        validPayload({ expectedAttendance: 'three hundred' }),
      );
      expect(messages).toMatch(/expectedAttendance must be a whole number/);
    });

    it('rejects an end time before the start time, flagging proposedEnd', async () => {
      const messages = await messagesFor(
        validPayload({
          proposedStart: '2030-10-01T17:00:00.000Z',
          proposedEnd: '2030-10-01T09:00:00.000Z',
        }),
      );
      expect(messages).toMatch(/proposedEnd must be later than proposedStart/);
    });

    it('rejects zero and negative attendance (AC-5)', async () => {
      for (const value of [0, -5]) {
        const messages = await messagesFor(
          validPayload({ expectedAttendance: value }),
        );
        expect(messages).toMatch(/expectedAttendance must be greater than zero/);
      }
    });

    it('rejects a fractional attendance', async () => {
      const messages = await messagesFor(
        validPayload({ expectedAttendance: 12.5 }),
      );
      expect(messages).toMatch(/expectedAttendance must be a whole number/);
    });

    it('rejects a missing category', async () => {
      const payload = validPayload();
      delete (payload as Record<string, unknown>).category;
      expect(await messagesFor(payload)).toMatch(/category is required/);
    });

    it('flags EVERY offending field at once, not just the first', async () => {
      const messages = await messagesFor(
        validPayload({
          purpose: '',
          category: '',
          expectedAttendance: 'not a number',
          proposedStart: '2020-01-01T09:00:00.000Z',
          proposedEnd: '2019-01-01T09:00:00.000Z',
        }),
      );

      expect(messages).toMatch(/purpose is required/);
      expect(messages).toMatch(/category is required/);
      expect(messages).toMatch(/expectedAttendance/);
      expect(messages).toMatch(/proposedStart must be in the future/);
      expect(messages).toMatch(/proposedEnd must be later than proposedStart/);
    });

    it('persists nothing when validation fails', async () => {
      await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(validPayload({ expectedAttendance: -1 }))
        .expect(400);

      expect(await prisma.eventRequest.count()).toBe(0);
    });
  });

  describe('AC-4: the Organiser sees every detail plus current status', () => {
    it('returns each submitted field accurately', async () => {
      const payload = validPayload({
        preferredLayout: 'Theatre',
        layoutNotes: 'Front row reserved for accessibility seating',
        accessibilityNeeds: 'Hearing loop required',
        equipmentNeeds: 'Six wireless microphones',
        registrationEnabled: true,
      });

      const created = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(payload)
        .expect(201);

      const viewed = await http()
        .get(`/events/${created.body.id}`)
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(viewed.body).toMatchObject({
        name: payload.name,
        purpose: payload.purpose,
        description: payload.description,
        category: payload.category,
        expectedAttendance: payload.expectedAttendance,
        preferredLayout: 'Theatre',
        layoutNotes: 'Front row reserved for accessibility seating',
        accessibilityNeeds: 'Hearing loop required',
        equipmentNeeds: 'Six wireless microphones',
        registrationEnabled: true,
        status: EventStatus.SUBMITTED,
      });
      expect(new Date(viewed.body.proposedStart).toISOString()).toBe(payload.proposedStart);
      expect(new Date(viewed.body.proposedEnd).toISOString()).toBe(payload.proposedEnd);
    });

    it('lists it among the organiser’s own requests', async () => {
      await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(validPayload())
        .expect(201);

      const mine = await http()
        .get('/events')
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(mine.body).toHaveLength(1);
      expect(mine.body[0].status).toBe(EventStatus.SUBMITTED);
    });

    it('denies another Organiser the record by id', async () => {
      const created = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(validPayload())
        .expect(201);

      await http()
        .get(`/events/${created.body.id}`)
        .set('Authorization', as('otherOrganiser'))
        .expect(404);
    });
  });

  describe('AC-5: attendance is stored as a positive whole number', () => {
    it('round-trips the value as a number', async () => {
      const created = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(validPayload({ expectedAttendance: 420 }))
        .expect(201);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: created.body.id },
      });

      expect(stored.expectedAttendance).toBe(420);
      expect(Number.isInteger(stored.expectedAttendance)).toBe(true);
      expect(stored.expectedAttendance).toBeGreaterThan(0);
    });

    it('accepts a numeric string and stores it as a number', async () => {
      // transform: true coerces before validation, so a form posting "250"
      // is still stored as an integer for later venue-suitability checks.
      const created = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(validPayload({ expectedAttendance: '250' }))
        .expect(201);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      expect(stored.expectedAttendance).toBe(250);
    });
  });
});
