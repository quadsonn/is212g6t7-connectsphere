import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  EquipmentStatus,
  EventStatus,
  PrismaClient,
  ReservationStatus,
  Role,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { nextReadableId } from '../src/prisma/readable-id';
import { listenOnLoopback } from './listen-on-loopback';

/**
 * US-45 e2e — Technical Support marks equipment Damaged or Under Maintenance,
 * and back to Available. One describe per acceptance criterion, named
 * "US-45 AC-n" for traceability.
 *
 * Stored values: OPERATIONAL is "Available", OUT_OF_SERVICE is "Damaged"
 * (see EQUIPMENT_STATUS_LABELS).
 */
describe('US-45 mark equipment damaged or under maintenance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  // Far enough ahead to stay "upcoming" whenever the suite runs.
  const START = '2030-10-01T09:00:00.000Z';
  const END = '2030-10-01T17:00:00.000Z';

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const changeStatus = (
    equipmentId: string,
    body: Record<string, unknown>,
    who = 'tech',
  ) =>
    http()
      .patch(`/equipment/${equipmentId}/status`)
      .set('Authorization', as(who))
      .send(body);

  const availability = (equipmentId: string, quantity: number) =>
    http()
      .get(`/equipment/${equipmentId}/availability`)
      .query({ start: START, end: END, quantity })
      .set('Authorization', as('tech'));

  const commit = (eventId: string, equipmentId: string, quantity: number) =>
    http()
      .post('/equipment/reservations')
      .set('Authorization', as('tech'))
      .send({ eventId, equipmentId, quantity });

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: key, role },
    });
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
    ids[key] = user.id;
  };

  const seedEvent = (name: string, start = START, end = END) =>
    prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        coordinatorId: ids.coordinator,
        name,
        purpose: 'Purpose',
        description: 'Description',
        category: 'Conference',
        proposedStart: new Date(start),
        proposedEnd: new Date(end),
        expectedAttendance: 100,
        equipmentNeeds: 'Microphones.',
        status: EventStatus.PLANNING,
      },
    });

  const seedReservation = (
    eventId: string,
    quantity: number,
    status: ReservationStatus,
    start = START,
    end = END,
  ) =>
    prisma.equipmentReservation.create({
      data: {
        eventId,
        equipmentId: ids.mic,
        quantity,
        start: new Date(start),
        end: new Date(end),
        status,
      },
    });

  const clear = async () => {
    // Equipment first: its status changes cascade with it, and they hold a
    // RESTRICT reference to the user who made them.
    await prisma.equipmentReservation.deleteMany();
    await prisma.equipment.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();
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
    // Leave no status changes behind for suites that delete users directly.
    await clear();
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await clear();

    await seedUser('tech', 'tech@example.com', Role.TECHNICAL_SUPPORT_STAFF);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);
    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('venueStaff', 'venue@example.com', Role.VENUE_STAFF);
    await seedUser('attendee', 'attendee@example.com', Role.ATTENDEE);

    ids.mic = (
      await prisma.equipment.create({
        data: { type: 'Wireless microphone', totalQuantity: 10, location: 'AV Store' },
      })
    ).id;
  });

  describe('US-45 AC-1: change an item to Damaged or Under Maintenance', () => {
    it.each([
      [EquipmentStatus.OUT_OF_SERVICE],
      [EquipmentStatus.UNDER_MAINTENANCE],
    ])('sets the status to %s and returns the updated item', async (status) => {
      const res = await changeStatus(ids.mic, { status, reason: 'Cracked casing.' }).expect(200);

      expect(res.body.equipment).toMatchObject({
        id: ids.mic,
        type: 'Wireless microphone',
        operationalStatus: status,
      });

      const stored = await prisma.equipment.findUniqueOrThrow({ where: { id: ids.mic } });
      expect(stored.operationalStatus).toBe(status);
    });

    it('moves a damaged item into maintenance', async () => {
      await changeStatus(ids.mic, {
        status: EquipmentStatus.OUT_OF_SERVICE,
        reason: 'Dropped.',
      }).expect(200);

      const res = await changeStatus(ids.mic, {
        status: EquipmentStatus.UNDER_MAINTENANCE,
        reason: 'Sent for repair.',
      }).expect(200);

      expect(res.body.equipment.operationalStatus).toBe('UNDER_MAINTENANCE');
    });

    it('shows the new status in the item detail the catalogue opens', async () => {
      await changeStatus(ids.mic, {
        status: EquipmentStatus.OUT_OF_SERVICE,
        reason: 'Cracked casing.',
      }).expect(200);

      const res = await http()
        .get(`/equipment/${ids.mic}`)
        .set('Authorization', as('tech'))
        .expect(200);

      expect(res.body.operationalStatus).toBe('OUT_OF_SERVICE');
    });

    it('409s when the item already has that status, and records nothing', async () => {
      const res = await changeStatus(ids.mic, {
        status: EquipmentStatus.OPERATIONAL,
        reason: 'No change.',
      }).expect(409);

      expect(res.body.message).toBe('this item is already Available');
      expect(await prisma.equipmentStatusChange.count()).toBe(0);
    });

    it('400s for a status that does not exist', async () => {
      await changeStatus(ids.mic, { status: 'BROKEN', reason: 'Bad value.' }).expect(400);
    });

    it('404s for an item that does not exist', async () => {
      await changeStatus('does-not-exist', {
        status: EquipmentStatus.OUT_OF_SERVICE,
        reason: 'Gone.',
      }).expect(404);
    });

    it.each(['coordinator', 'organiser', 'venueStaff', 'attendee'])(
      'is refused to %s — Technical Support only',
      async (who) => {
        await changeStatus(
          ids.mic,
          { status: EquipmentStatus.OUT_OF_SERVICE, reason: 'Not mine to say.' },
          who,
        ).expect(403);

        const stored = await prisma.equipment.findUniqueOrThrow({ where: { id: ids.mic } });
        expect(stored.operationalStatus).toBe(EquipmentStatus.OPERATIONAL);
      },
    );

    it('401s, changing nothing, when the token\'s user no longer exists', async () => {
      // e.g. a token issued by another database that shares the JWT secret.
      const orphan = app.get(JwtService).sign({
        sub: 'user-that-does-not-exist',
        role: Role.TECHNICAL_SUPPORT_STAFF,
        jti: 'orphan-token',
      });

      const res = await http()
        .patch(`/equipment/${ids.mic}/status`)
        .set('Authorization', `Bearer ${orphan}`)
        .send({ status: EquipmentStatus.OUT_OF_SERVICE, reason: 'Stale session.' })
        .expect(401);

      expect(res.body.message).toBe('your account no longer exists, please log in again');
      const stored = await prisma.equipment.findUniqueOrThrow({ where: { id: ids.mic } });
      expect(stored.operationalStatus).toBe(EquipmentStatus.OPERATIONAL);
      expect(await prisma.equipmentStatusChange.count()).toBe(0);
    });

    it('is refused without a token', async () => {
      await http()
        .patch(`/equipment/${ids.mic}/status`)
        .send({ status: EquipmentStatus.OUT_OF_SERVICE, reason: 'Anonymous.' })
        .expect(401);
    });
  });

  describe('US-45 AC-2: a reason is required, and saved with the change', () => {
    it.each([
      ['missing', {}],
      ['empty', { reason: '' }],
      ['whitespace only', { reason: '   \n\t ' }],
      ['not a string', { reason: 42 }],
    ])('400s when the reason is %s, and changes nothing', async (_label, extra) => {
      const res = await changeStatus(ids.mic, {
        status: EquipmentStatus.OUT_OF_SERVICE,
        ...extra,
      }).expect(400);

      expect(res.body.message).toContain('a reason is required to change the status');

      const stored = await prisma.equipment.findUniqueOrThrow({ where: { id: ids.mic } });
      expect(stored.operationalStatus).toBe(EquipmentStatus.OPERATIONAL);
      expect(await prisma.equipmentStatusChange.count()).toBe(0);
    });

    it('records the change: from, to, trimmed reason, who and when', async () => {
      const before = Date.now();

      await changeStatus(ids.mic, {
        status: EquipmentStatus.OUT_OF_SERVICE,
        reason: '  Cracked casing.  ',
      }).expect(200);

      const [change] = await prisma.equipmentStatusChange.findMany();
      expect(change).toMatchObject({
        equipmentId: ids.mic,
        fromStatus: EquipmentStatus.OPERATIONAL,
        toStatus: EquipmentStatus.OUT_OF_SERVICE,
        reason: 'Cracked casing.',
        changedById: ids.tech,
      });
      // Readable IDs (CLAUDE.md, "IDs").
      expect(change.id).toMatch(/^ESC-\d{3,}$/);
      expect(change.changedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    });

    it('gives every change its own readable ID, even when written at the same moment', async () => {
      // Concurrent writers share one counter; the database never hands out a
      // number twice (src/prisma/readable-id.ts).
      const issued = await Promise.all(
        Array.from({ length: 20 }, () => nextReadableId(prisma, 'EquipmentStatusChange')),
      );

      expect(new Set(issued).size).toBe(20);
      expect(issued.every((id) => /^ESC-\d{3,}$/.test(id))).toBe(true);
    });

    it('the database refuses an ID that is not in the readable format', async () => {
      await expect(
        prisma.equipmentStatusChange.create({
          data: {
            id: 'cmvceuvlu000furdmm66oov5o',
            equipmentId: ids.mic,
            fromStatus: EquipmentStatus.OPERATIONAL,
            toStatus: EquipmentStatus.OUT_OF_SERVICE,
            reason: 'Cracked casing.',
            changedById: ids.tech,
          },
        }),
      ).rejects.toThrow(/EquipmentStatusChange_readable_id/);
    });

    it('shows the latest reason in the item detail', async () => {
      await changeStatus(ids.mic, {
        status: EquipmentStatus.OUT_OF_SERVICE,
        reason: 'Dropped.',
      }).expect(200);
      await changeStatus(ids.mic, {
        status: EquipmentStatus.UNDER_MAINTENANCE,
        reason: 'Sent for repair.',
      }).expect(200);

      const res = await http()
        .get(`/equipment/${ids.mic}`)
        .set('Authorization', as('tech'))
        .expect(200);

      expect(res.body.latestStatusChange).toEqual({
        id: expect.any(String),
        fromStatus: 'OUT_OF_SERVICE',
        toStatus: 'UNDER_MAINTENANCE',
        reason: 'Sent for repair.',
        changedAt: expect.any(String),
        changedBy: { id: ids.tech, name: 'tech' },
      });
    });

    it('the database refuses a blank reason written around the API', async () => {
      await expect(
        prisma.equipmentStatusChange.create({
          data: {
            id: 'ESC-900',
            equipmentId: ids.mic,
            fromStatus: EquipmentStatus.OPERATIONAL,
            toStatus: EquipmentStatus.OUT_OF_SERVICE,
            reason: '   ',
            changedById: ids.tech,
          },
        }),
      ).rejects.toThrow(/EquipmentStatusChange_has_reason/);
    });
  });

  describe('US-45 AC-3: set an item back to Available once repaired', () => {
    it.each([
      [EquipmentStatus.OUT_OF_SERVICE],
      [EquipmentStatus.UNDER_MAINTENANCE],
    ])('moves %s back to OPERATIONAL, with a reason', async (status) => {
      await changeStatus(ids.mic, { status, reason: 'Faulty.' }).expect(200);

      const res = await changeStatus(ids.mic, {
        status: EquipmentStatus.OPERATIONAL,
        reason: 'Repaired and tested.',
      }).expect(200);

      expect(res.body.equipment.operationalStatus).toBe('OPERATIONAL');
      expect(res.body.equipment.latestStatusChange).toMatchObject({
        fromStatus: status,
        toStatus: 'OPERATIONAL',
        reason: 'Repaired and tested.',
      });
    });

    it('requires a reason to set it back too', async () => {
      await changeStatus(ids.mic, {
        status: EquipmentStatus.OUT_OF_SERVICE,
        reason: 'Faulty.',
      }).expect(200);

      await changeStatus(ids.mic, { status: EquipmentStatus.OPERATIONAL, reason: ' ' }).expect(
        400,
      );
    });
  });

  describe('US-45 AC-4: damaged or under-maintenance items are excluded from availability and reservations', () => {
    it.each([
      [EquipmentStatus.OUT_OF_SERVICE, 'damaged (out of service)'],
      [EquipmentStatus.UNDER_MAINTENANCE, 'under maintenance'],
    ])('a %s item has no free units and cannot be committed', async (status, condition) => {
      const event = await seedEvent('Conference');

      await changeStatus(ids.mic, { status, reason: 'Faulty.' }).expect(200);

      const check = await availability(ids.mic, 1).expect(200);
      expect(check.body).toMatchObject({
        operationalStatus: status,
        unavailableQuantity: 10,
        availableQuantity: 0,
        fullyAvailable: false,
      });

      const refused = await commit(event.id, ids.mic, 1).expect(409);
      expect(refused.body.message).toBe(
        `Wireless microphone is ${condition}, so none of it can be committed.`,
      );
      expect(await prisma.equipmentReservation.count()).toBe(0);
    });

    it('is available and committable again once set back to Available', async () => {
      const event = await seedEvent('Conference');

      await changeStatus(ids.mic, {
        status: EquipmentStatus.OUT_OF_SERVICE,
        reason: 'Faulty.',
      }).expect(200);
      await changeStatus(ids.mic, {
        status: EquipmentStatus.OPERATIONAL,
        reason: 'Repaired.',
      }).expect(200);

      const check = await availability(ids.mic, 10).expect(200);
      expect(check.body).toMatchObject({ availableQuantity: 10, fullyAvailable: true });

      await commit(event.id, ids.mic, 10).expect(201);
    });
  });

  describe('US-45 AC-5: a warning lists the reservations the change affects', () => {
    it('lists live, upcoming reservations of the item, soonest first', async () => {
      const later = await seedEvent('Later', '2030-11-01T09:00:00Z', '2030-11-01T17:00:00Z');
      const sooner = await seedEvent('Sooner');
      const laterRes = await seedReservation(
        later.id,
        2,
        ReservationStatus.APPROVED,
        '2030-11-01T09:00:00Z',
        '2030-11-01T17:00:00Z',
      );
      const soonerRes = await seedReservation(sooner.id, 3, ReservationStatus.REQUESTED);

      const res = await changeStatus(ids.mic, {
        status: EquipmentStatus.OUT_OF_SERVICE,
        reason: 'Faulty.',
      }).expect(200);

      expect(res.body.affectedReservations).toEqual([
        {
          id: soonerRes.id,
          quantity: 3,
          start: START,
          end: END,
          status: 'REQUESTED',
          event: {
            id: sooner.id,
            name: 'Sooner',
            status: 'PLANNING',
            coordinator: { id: ids.coordinator, name: 'coordinator' },
          },
        },
        expect.objectContaining({ id: laterRes.id, quantity: 2, status: 'APPROVED' }),
      ]);
    });

    it('leaves out reservations that are released, rejected, already over, or for another item', async () => {
      const event = await seedEvent('Conference');
      const pastEvent = await seedEvent('Past', '2020-01-01T09:00:00Z', '2020-01-01T17:00:00Z');
      const other = await prisma.equipment.create({
        data: { type: 'Projector', totalQuantity: 2 },
      });

      await seedReservation(event.id, 1, ReservationStatus.RELEASED);
      await seedReservation(event.id, 1, ReservationStatus.REJECTED);
      await seedReservation(
        pastEvent.id,
        1,
        ReservationStatus.APPROVED,
        '2020-01-01T09:00:00Z',
        '2020-01-01T17:00:00Z',
      );
      await prisma.equipmentReservation.create({
        data: {
          eventId: event.id,
          equipmentId: other.id,
          quantity: 1,
          start: new Date(START),
          end: new Date(END),
          status: ReservationStatus.APPROVED,
        },
      });

      const res = await changeStatus(ids.mic, {
        status: EquipmentStatus.UNDER_MAINTENANCE,
        reason: 'Service.',
      }).expect(200);

      expect(res.body.affectedReservations).toEqual([]);
    });

    it('lists nothing when an item is set back to Available', async () => {
      const event = await seedEvent('Conference');
      await seedReservation(event.id, 2, ReservationStatus.APPROVED);

      await changeStatus(ids.mic, {
        status: EquipmentStatus.OUT_OF_SERVICE,
        reason: 'Faulty.',
      }).expect(200);

      const res = await changeStatus(ids.mic, {
        status: EquipmentStatus.OPERATIONAL,
        reason: 'Repaired.',
      }).expect(200);

      expect(res.body.affectedReservations).toEqual([]);
    });

    it('warns without changing the reservations themselves', async () => {
      const event = await seedEvent('Conference');
      const reservation = await seedReservation(event.id, 2, ReservationStatus.APPROVED);

      await changeStatus(ids.mic, {
        status: EquipmentStatus.OUT_OF_SERVICE,
        reason: 'Faulty.',
      }).expect(200);

      const stored = await prisma.equipmentReservation.findUniqueOrThrow({
        where: { id: reservation.id },
      });
      expect(stored.status).toBe(ReservationStatus.APPROVED);
    });

    it('shows the same list before the change is saved, for the warning', async () => {
      const event = await seedEvent('Conference');
      const reservation = await seedReservation(event.id, 2, ReservationStatus.APPROVED);

      const res = await http()
        .get(`/equipment/${ids.mic}/upcoming-reservations`)
        .set('Authorization', as('tech'))
        .expect(200);

      expect(res.body).toEqual([
        expect.objectContaining({
          id: reservation.id,
          quantity: 2,
          status: 'APPROVED',
          event: expect.objectContaining({ id: event.id, name: 'Conference' }),
        }),
      ]);

      // Reading it changes nothing.
      const stored = await prisma.equipment.findUniqueOrThrow({ where: { id: ids.mic } });
      expect(stored.operationalStatus).toBe(EquipmentStatus.OPERATIONAL);
    });

    it('the preview is Technical Support only, and 404s for an unknown item', async () => {
      await http()
        .get(`/equipment/${ids.mic}/upcoming-reservations`)
        .set('Authorization', as('coordinator'))
        .expect(403);

      await http()
        .get('/equipment/does-not-exist/upcoming-reservations')
        .set('Authorization', as('tech'))
        .expect(404);
    });
  });
});
