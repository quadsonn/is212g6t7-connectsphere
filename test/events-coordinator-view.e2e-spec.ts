import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { listenOnLoopback } from './listen-on-loopback';

/** US-12 e2e — one describe per acceptance criterion. */
describe('US-12 coordinator views all details (e2e)', () => {
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
        name: 'Freshman Orientation 2030',
        purpose: 'Welcome new students and introduce campus services',
        description: 'Full-day programme with talks, booths and a closing social',
        category: 'Student engagement',
        proposedStart: new Date('2030-10-01T09:00:00Z'),
        proposedEnd: new Date('2030-10-01T17:00:00Z'),
        expectedAttendance: 320,
        preferredLayout: 'THEATRE',
        layoutNotes: 'Centre aisle, front row reserved',
        accessibilityRequirements: ['STEP_FREE_ACCESS', 'HEARING_LOOP'],
        accessibilityNotes: 'Ramp access to the stage',
        equipmentNeeds: 'Six wireless microphones, two projectors',
        registrationEnabled: true,
        status: EventStatus.SUBMITTED,
        coordinatorId: ids.coordinatorA,
        ...overrides,
      },
    });

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
    await seedUser('otherOrganiser', 'other.org@example.com', Role.EVENT_ORGANISER);
    await seedUser('coordinatorA', 'coord.a@example.com', Role.EVENT_COORDINATOR);
    await seedUser('coordinatorB', 'coord.b@example.com', Role.EVENT_COORDINATOR);
    await seedUser('attendee', 'attendee@example.com', Role.ATTENDEE);
    await seedUser('venueStaff', 'venue@example.com', Role.VENUE_STAFF);
  });

  describe('AC-1: the assigned Coordinator sees every core detail', () => {
    it('returns name, purpose, description, dates and attendance', async () => {
      const event = await seedEvent();

      const res = await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      expect(res.body).toMatchObject({
        name: 'Freshman Orientation 2030',
        purpose: 'Welcome new students and introduce campus services',
        description: 'Full-day programme with talks, booths and a closing social',
        category: 'Student engagement',
        expectedAttendance: 320,
        status: EventStatus.SUBMITTED,
      });
      expect(new Date(res.body.proposedStart).toISOString()).toBe(
        '2030-10-01T09:00:00.000Z',
      );
      expect(new Date(res.body.proposedEnd).toISOString()).toBe(
        '2030-10-01T17:00:00.000Z',
      );
    });

    it('returns the venue requirements', async () => {
      const event = await seedEvent();

      const res = await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      expect(res.body.preferredLayout).toBe('THEATRE');
      expect(res.body.layoutNotes).toBe('Centre aisle, front row reserved');
      expect(res.body.expectedAttendance).toBe(320);
    });

    it('returns the accessibility needs', async () => {
      const event = await seedEvent();

      const res = await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      expect(res.body.accessibilityRequirements).toEqual([
        'STEP_FREE_ACCESS',
        'HEARING_LOOP',
      ]);
      expect(res.body.accessibilityNotes).toBe('Ramp access to the stage');
    });

    it('identifies who raised the request', async () => {
      const event = await seedEvent();

      const res = await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      expect(res.body.organiser).toMatchObject({
        id: ids.organiser,
        email: 'organiser@example.com',
      });
    });

    it('lists the queue with the same detail', async () => {
      await seedEvent();

      const res = await http()
        .get('/events/assigned')
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        name: 'Freshman Orientation 2030',
        preferredLayout: 'THEATRE',
        expectedAttendance: 320,
      });
    });
  });

  describe('AC-2: equipment and registration requirements', () => {
    it('shows equipment needs alongside the core details', async () => {
      const event = await seedEvent();

      const res = await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      expect(res.body.equipmentNeeds).toBe(
        'Six wireless microphones, two projectors',
      );
      expect(res.body.name).toBe('Freshman Orientation 2030');
    });

    it('shows the registration setting', async () => {
      const event = await seedEvent();

      const res = await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      expect(res.body.registrationEnabled).toBe(true);
    });

    it('reports absent requirements explicitly rather than omitting the keys', async () => {
      const event = await seedEvent({
        equipmentNeeds: null,
        accessibilityRequirements: [],
        accessibilityNotes: null,
        registrationEnabled: false,
      });

      const res = await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      expect(res.body).toHaveProperty('equipmentNeeds', null);
      expect(res.body).toHaveProperty('accessibilityNotes', null);
      expect(res.body.accessibilityRequirements).toEqual([]);
      expect(res.body.registrationEnabled).toBe(false);
    });
  });

  describe('AC-3: anyone not associated gets no event data', () => {
    it('denies a Coordinator assigned to nothing, once the event belongs to a peer', async () => {
      const event = await seedEvent({ coordinatorId: ids.coordinatorA });

      const res = await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('coordinatorB'))
        .expect(404);

      expect(res.body.name).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toMatch(/Freshman/);
    });

    it('keeps a peer’s event out of the queue listing', async () => {
      await seedEvent({ coordinatorId: ids.coordinatorA });

      const res = await http()
        .get('/events/assigned')
        .set('Authorization', as('coordinatorB'))
        .expect(200);

      expect(res.body).toHaveLength(0);
    });

    it.each(['organiser', 'otherOrganiser', 'attendee', 'venueStaff'])(
      'refuses %s at the role gate',
      async (who) => {
        const event = await seedEvent();

        const res = await http()
          .get(`/events/assigned/${event.id}`)
          .set('Authorization', as(who))
          .expect(403);

        expect(JSON.stringify(res.body)).not.toMatch(/Freshman/);
      },
    );

    it('refuses an unauthenticated caller', async () => {
      const event = await seedEvent();

      const res = await http().get(`/events/assigned/${event.id}`).expect(401);
      expect(JSON.stringify(res.body)).not.toMatch(/Freshman/);
    });

    it('does not leak the organiser’s contact details on denial', async () => {
      const event = await seedEvent({ coordinatorId: ids.coordinatorA });

      const res = await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('coordinatorB'))
        .expect(404);

      expect(JSON.stringify(res.body)).not.toMatch(/organiser@example\.com/);
    });

    it('denies an event that does not exist', async () => {
      await http()
        .get('/events/assigned/does-not-exist')
        .set('Authorization', as('coordinatorA'))
        .expect(404);
    });
  });

  describe('the unassigned queue belongs to the Lead', () => {
    it('hides an unassigned SUBMITTED request from every Coordinator', async () => {
      // It waits in the Lead's queue until assigned (events-assignment.e2e-spec.ts).
      const event = await seedEvent({ coordinatorId: null });

      for (const who of ['coordinatorA', 'coordinatorB']) {
        await http()
          .get(`/events/assigned/${event.id}`)
          .set('Authorization', as(who))
          .expect(404);
      }
    });

    it('shows an assigned request only to its own Coordinator', async () => {
      const event = await seedEvent({ coordinatorId: ids.coordinatorA });

      await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);
      await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('coordinatorB'))
        .expect(404);
    });

    it('never exposes an unassigned DRAFT', async () => {
      const event = await seedEvent({
        coordinatorId: null,
        status: EventStatus.DRAFT,
      });

      await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('coordinatorB'))
        .expect(404);
    });
  });

  describe('route resolution', () => {
    it('does not treat "assigned" as an event id', async () => {
      await seedEvent();

      const res = await http()
        .get('/events/assigned')
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
