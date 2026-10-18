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
import request from 'supertest';

import { AppModule } from '../src/app.module';

/** US-29 e2e — one describe per acceptance criterion, tagged "US-29 AC-n". */
describe('US-29 check equipment availability for a date and time (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const START = '2030-10-01T09:00:00.000Z';
  const END = '2030-10-01T17:00:00.000Z';

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const check = (
    equipmentId: string,
    query: Record<string, string | number>,
    who = 'tech',
  ) =>
    http()
      .get(`/equipment/${equipmentId}/availability`)
      .query(query)
      .set('Authorization', as(who));

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: key, role },
    });
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
    ids[key] = user.id;
  };

  const seedEvent = (name: string) =>
    prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        name,
        purpose: 'Purpose',
        description: 'Description',
        category: 'Conference',
        proposedStart: new Date(START),
        proposedEnd: new Date(END),
        expectedAttendance: 100,
        status: EventStatus.PLANNING,
      },
    });

  /** Seeds a reservation directly — fixture data, not the US-31 commit path. */
  const reserve = (
    equipmentId: string,
    quantity: number,
    start: string,
    end: string,
    status: ReservationStatus = ReservationStatus.APPROVED,
  ) =>
    prisma.equipmentReservation.create({
      data: {
        eventId: ids.otherEvent,
        equipmentId,
        quantity,
        start: new Date(start),
        end: new Date(end),
        status,
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
    await prisma.notification.deleteMany();
    await prisma.equipmentReservation.deleteMany();
    await prisma.equipment.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();

    await seedUser('tech', 'tech@example.com', Role.TECHNICAL_SUPPORT_STAFF);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);
    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('attendee', 'attendee@example.com', Role.ATTENDEE);
    await seedUser('venueStaff', 'venue@example.com', Role.VENUE_STAFF);

    ids.mic = (
      await prisma.equipment.create({ data: { type: 'Wireless microphone', totalQuantity: 24 } })
    ).id;
    ids.pa = (
      await prisma.equipment.create({ data: { type: 'Portable PA system', totalQuantity: 6 } })
    ).id;
    ids.projector = (
      await prisma.equipment.create({
        data: {
          type: 'Projector (4K)',
          totalQuantity: 8,
          operationalStatus: EquipmentStatus.UNDER_MAINTENANCE,
        },
      })
    ).id;
    ids.reel = (
      await prisma.equipment.create({
        data: {
          type: 'Extension reel',
          totalQuantity: 15,
          operationalStatus: EquipmentStatus.OUT_OF_SERVICE,
        },
      })
    ).id;

    ids.otherEvent = (await seedEvent('Industry Night')).id;
  });

  describe('US-29 AC-1: available units of the requested type are shown for a date and time', () => {
    it('returns the free count for the window', async () => {
      const res = await check(ids.mic, { start: START, end: END, quantity: 6 }).expect(200);

      expect(res.body).toEqual({
        equipmentId: ids.mic,
        type: 'Wireless microphone',
        operationalStatus: 'OPERATIONAL',
        start: START,
        end: END,
        requestedQuantity: 6,
        totalQuantity: 24,
        unavailableQuantity: 0,
        reservedQuantity: 0,
        availableQuantity: 24,
        fullyAvailable: true,
        shortfall: 0,
      });
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it.each(['coordinator', 'organiser', 'attendee', 'venueStaff'])(
      'is refused to %s — Technical Support only',
      async (who) => {
        await check(ids.mic, { start: START, end: END, quantity: 1 }, who).expect(403);
      },
    );

    it('is refused without a token', async () => {
      await http()
        .get(`/equipment/${ids.mic}/availability`)
        .query({ start: START, end: END, quantity: 1 })
        .expect(401);
    });

    it('rejects an end that is not after the start', async () => {
      const res = await check(ids.mic, { start: END, end: START, quantity: 1 }).expect(400);

      expect((res.body.message as string[]).join(' | ')).toMatch(/end must be later than start/);
    });

    it('rejects a missing or malformed date', async () => {
      await check(ids.mic, { end: END, quantity: 1 }).expect(400);
      await check(ids.mic, { start: 'not-a-date', end: END, quantity: 1 }).expect(400);
    });

    it.each([0, -1, 1.5])('rejects a quantity of %s', async (quantity) => {
      await check(ids.mic, { start: START, end: END, quantity }).expect(400);
    });

    it('404s for equipment that does not exist', async () => {
      await check('does-not-exist', { start: START, end: END, quantity: 1 }).expect(404);
    });
  });

  describe('US-29 AC-2: equipment reserved for an overlapping event is excluded', () => {
    it('subtracts units committed to an event at an overlapping time', async () => {
      await reserve(ids.mic, 10, '2030-10-01T12:00:00Z', '2030-10-01T20:00:00Z');

      const res = await check(ids.mic, { start: START, end: END, quantity: 1 }).expect(200);

      expect(res.body).toMatchObject({ reservedQuantity: 10, availableQuantity: 14 });
    });

    it('ignores reservations at non-overlapping times, including back-to-back', async () => {
      await reserve(ids.mic, 10, '2030-10-01T05:00:00Z', '2030-10-01T09:00:00Z');
      await reserve(ids.mic, 10, '2030-10-01T17:00:00Z', '2030-10-01T19:00:00Z');
      await reserve(ids.mic, 10, '2030-10-02T09:00:00Z', '2030-10-02T17:00:00Z');

      const res = await check(ids.mic, { start: START, end: END, quantity: 1 }).expect(200);

      expect(res.body.availableQuantity).toBe(24);
    });

    it.each([
      ReservationStatus.REQUESTED,
      ReservationStatus.REJECTED,
      ReservationStatus.RELEASED,
    ])('does not count a %s reservation', async (status) => {
      await reserve(ids.mic, 5, START, END, status);

      const res = await check(ids.mic, { start: START, end: END, quantity: 1 }).expect(200);

      expect(res.body.availableQuantity).toBe(24);
    });

    it('counts the peak in use, not the sum, across separate time slots', async () => {
      await reserve(ids.mic, 10, '2030-10-01T09:00:00Z', '2030-10-01T12:00:00Z');
      await reserve(ids.mic, 10, '2030-10-01T13:00:00Z', '2030-10-01T17:00:00Z');

      const res = await check(ids.mic, { start: START, end: END, quantity: 1 }).expect(200);

      expect(res.body).toMatchObject({ reservedQuantity: 10, availableQuantity: 14 });
    });

    it('counts only reservations of the requested item', async () => {
      await reserve(ids.pa, 6, START, END);

      const res = await check(ids.mic, { start: START, end: END, quantity: 1 }).expect(200);

      expect(res.body.availableQuantity).toBe(24);
    });
  });

  describe('US-29 AC-3: damaged or under-maintenance equipment is excluded', () => {
    it.each([
      ['under maintenance', 'projector', 8, 'UNDER_MAINTENANCE'],
      ['damaged (out of service)', 'reel', 15, 'OUT_OF_SERVICE'],
    ])('reports no free units for an item %s', async (_label, key, total, status) => {
      const res = await check(ids[key], { start: START, end: END, quantity: 1 }).expect(200);

      expect(res.body).toMatchObject({
        operationalStatus: status,
        totalQuantity: total,
        unavailableQuantity: total,
        availableQuantity: 0,
        fullyAvailable: false,
      });
    });
  });

  describe('US-29 AC-4: indicates when the requested quantity is not fully available', () => {
    beforeEach(async () => {
      await reserve(ids.pa, 4, START, END); // leaves 2 of 6 free
    });

    it.each([
      ['below', 1, true, 0],
      ['equal to', 2, true, 0],
      ['above', 3, false, 1],
      ['well above', 6, false, 4],
    ])(
      'a request %s the free count → fullyAvailable %s, shortfall %s',
      async (_label, quantity, fully, shortfall) => {
        const res = await check(ids.pa, { start: START, end: END, quantity }).expect(200);

        expect(res.body).toMatchObject({
          requestedQuantity: quantity,
          availableQuantity: 2,
          fullyAvailable: fully,
          shortfall,
        });
      },
    );

    it('reports the whole request as the shortfall for damaged equipment', async () => {
      const res = await check(ids.reel, { start: START, end: END, quantity: 3 }).expect(200);

      expect(res.body).toMatchObject({ availableQuantity: 0, shortfall: 3 });
    });
  });
});
