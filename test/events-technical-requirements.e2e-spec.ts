import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, PrismaClient, ReservationStatus, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { listenOnLoopback } from './listen-on-loopback';

/** US-28 e2e — record equipment and technical requirements for an event. */
describe('US-28 equipment and technical requirements (e2e)', () => {
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
        status: EventStatus.PLANNING,
        ...overrides,
      },
    });

  const record = (eventId: string, body: Record<string, unknown>, who = 'coordinatorA') =>
    http()
      .patch(`/events/${eventId}/technical-requirements`)
      .set('Authorization', as(who))
      .send(body);

  const EQUIPMENT = [
    { equipmentType: 'Laser projector', quantity: 2 },
    { equipmentType: 'Wireless microphone', quantity: 6, notes: 'Lapel' },
  ];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await listenOnLoopback(app);

    prisma = new PrismaClient();
  });

  const cleanUp = async () => {
    await prisma.notification.deleteMany();
    await prisma.clarificationMessage.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.equipment.deleteMany();
    await prisma.user.deleteMany();
  };

  afterAll(async () => {
    await cleanUp();
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await cleanUp();

    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('coordinatorA', 'coord.a@example.com', Role.EVENT_COORDINATOR);
    await seedUser('coordinatorB', 'coord.b@example.com', Role.EVENT_COORDINATOR);
    await seedUser('tech', 'tech@example.com', Role.TECHNICAL_SUPPORT_STAFF);
    await seedUser('attendee', 'attendee@example.com', Role.ATTENDEE);
  });

  describe('AC-1: required equipment (type and quantity) is saved', () => {
    it('saves each line against the event', async () => {
      const event = await seedEvent();

      const res = await record(event.id, { equipment: EQUIPMENT }).expect(200);

      expect(
        res.body.equipmentRequirements.map(
          (r: { equipmentType: string; quantity: number; notes: string | null }) => [
            r.equipmentType,
            r.quantity,
            r.notes,
          ],
        ),
      ).toEqual([
        ['Laser projector', 2, null],
        ['Wireless microphone', 6, 'Lapel'],
      ]);
      expect(await prisma.equipmentRequirement.count({ where: { eventId: event.id } })).toBe(2);
    });

    it('replaces the list on a later save', async () => {
      const event = await seedEvent();
      await record(event.id, { equipment: EQUIPMENT }).expect(200);

      const res = await record(event.id, {
        equipment: [{ equipmentType: 'Laser projector', quantity: 3 }],
      }).expect(200);

      expect(res.body.equipmentRequirements).toHaveLength(1);
      expect(res.body.equipmentRequirements[0].quantity).toBe(3);
    });

    it('clears the list when sent empty', async () => {
      const event = await seedEvent();
      await record(event.id, { equipment: EQUIPMENT }).expect(200);

      await record(event.id, { equipment: [] }).expect(200);

      expect(await prisma.equipmentRequirement.count({ where: { eventId: event.id } })).toBe(0);
    });

    it('rejects a missing type or a non-positive quantity', async () => {
      const event = await seedEvent();

      await record(event.id, { equipment: [{ equipmentType: '', quantity: 1 }] }).expect(400);
      await record(event.id, { equipment: [{ equipmentType: 'Mic', quantity: 0 }] }).expect(400);
      await record(event.id, { equipment: [{ equipmentType: 'Mic', quantity: 1.5 }] }).expect(400);
    });

    it('rejects the same type twice', async () => {
      const event = await seedEvent();

      await record(event.id, {
        equipment: [
          { equipmentType: 'Mic', quantity: 1 },
          { equipmentType: 'mic', quantity: 2 },
        ],
      }).expect(400);
    });
  });

  describe('AC-2: technical support needed is saved', () => {
    it('saves the description against the event', async () => {
      const event = await seedEvent();

      const res = await record(event.id, {
        technicalSupportNeeds: 'On-site AV technician; hybrid setup with Zoom',
      }).expect(200);

      expect(res.body.technicalSupportNeeds).toBe(
        'On-site AV technician; hybrid setup with Zoom',
      );
      const stored = await prisma.eventRequest.findUniqueOrThrow({ where: { id: event.id } });
      expect(stored.technicalSupportNeeds).toBe('On-site AV technician; hybrid setup with Zoom');
    });
  });

  describe('"is planning an event"', () => {
    it('refuses an event that is not in planning', async () => {
      const event = await seedEvent({ status: EventStatus.APPROVED });

      await record(event.id, { equipment: EQUIPMENT }).expect(409);
    });

    it('refuses a Coordinator the event is not assigned to', async () => {
      const event = await seedEvent();

      await record(event.id, { equipment: EQUIPMENT }, 'coordinatorB').expect(404);
    });

    it('refuses Technical Support and Organisers', async () => {
      const event = await seedEvent();

      await record(event.id, { equipment: EQUIPMENT }, 'tech').expect(403);
      await record(event.id, { equipment: EQUIPMENT }, 'organiser').expect(403);
    });
  });

  describe('AC-3: Technical Support see the recorded requirements', () => {
    it('shows them on the event', async () => {
      const event = await seedEvent();
      await record(event.id, {
        equipment: EQUIPMENT,
        technicalSupportNeeds: 'Hybrid setup',
      }).expect(200);

      const res = await http()
        .get(`/events/${event.id}`)
        .set('Authorization', as('tech'))
        .expect(200);

      expect(res.body.technicalSupportNeeds).toBe('Hybrid setup');
      expect(
        res.body.equipmentRequirements.map((r: { equipmentType: string }) => r.equipmentType),
      ).toEqual(['Laser projector', 'Wireless microphone']);
    });

    it('lists an event once it has requirements, even with nothing reserved', async () => {
      const withRequirements = await seedEvent();
      const withSupportOnly = await seedEvent({ name: 'Support only' });
      await seedEvent({ name: 'Nothing recorded' });
      await record(withRequirements.id, { equipment: EQUIPMENT }).expect(200);
      await record(withSupportOnly.id, { technicalSupportNeeds: 'Technician' }).expect(200);

      const res = await http().get('/events').set('Authorization', as('tech')).expect(200);

      expect(res.body.map((e: { id: string }) => e.id).sort()).toEqual(
        [withRequirements.id, withSupportOnly.id].sort(),
      );
    });

    it('still lists an event that only has a reservation', async () => {
      const event = await seedEvent();
      const equipment = await prisma.equipment.create({
        data: { type: 'Projector', totalQuantity: 4 },
      });
      await prisma.equipmentReservation.create({
        data: {
          eventId: event.id,
          equipmentId: equipment.id,
          quantity: 1,
          start: event.proposedStart!,
          end: event.proposedEnd!,
          status: ReservationStatus.REQUESTED,
        },
      });

      const res = await http().get('/events').set('Authorization', as('tech')).expect(200);

      expect(res.body.map((e: { id: string }) => e.id)).toEqual([event.id]);
    });

    it('never shows them to an Attendee', async () => {
      const event = await seedEvent({ registrationEnabled: true });
      await record(event.id, { equipment: EQUIPMENT, technicalSupportNeeds: 'Hybrid' }).expect(
        200,
      );

      const res = await http()
        .get(`/events/${event.id}`)
        .set('Authorization', as('attendee'))
        .expect(200);

      expect(res.body.equipmentRequirements).toBeUndefined();
      expect(res.body.technicalSupportNeeds).toBeUndefined();
    });

    it('shows them to the Coordinator on the detail view', async () => {
      const event = await seedEvent();
      await record(event.id, { equipment: EQUIPMENT }).expect(200);

      const res = await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      expect(res.body.equipmentRequirements).toHaveLength(2);
    });
  });

  describe('history (US-26)', () => {
    it('records each save with the before and after', async () => {
      const event = await seedEvent();
      await record(event.id, { equipment: EQUIPMENT }).expect(200);
      await record(event.id, {
        equipment: [{ equipmentType: 'Laser projector', quantity: 3 }],
        technicalSupportNeeds: 'Hybrid',
      }).expect(200);

      const res = await http()
        .get(`/events/${event.id}/history`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      expect(res.body.entries).toHaveLength(2);
      expect(res.body.entries[1].changes).toEqual([
        {
          field: 'equipmentRequirements',
          previous: ['2 × Laser projector', '6 × Wireless microphone (Lapel)'],
          next: ['3 × Laser projector'],
        },
        { field: 'technicalSupportNeeds', previous: null, next: 'Hybrid' },
      ]);
    });
  });
});
