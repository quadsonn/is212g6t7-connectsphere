import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  EquipmentStatus,
  EventStatus,
  NotificationType,
  PrismaClient,
  ReservationStatus,
  Role,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { nextReadableId } from '../src/prisma/readable-id';
import { listenOnLoopback } from './listen-on-loopback';

const { OPERATIONAL, UNDER_MAINTENANCE, OUT_OF_SERVICE } = EquipmentStatus;

/**
 * US-45 e2e (reopened) — Technical Support mark a quantity of an item's units
 * Damaged or Under Maintenance, and back to Available. One describe per
 * acceptance criterion, named "US-45 AC-n" for traceability; the stories it
 * changes (US-29, US-31, US-48, US-60, US-67) are named where they are tested.
 *
 *   AC-1 mark a quantity damaged or under maintenance (separate counts);
 *        refuse more than are working
 *   AC-2 a reason is required; the history records quantity, status, reason,
 *        who and when
 *   AC-3 set a quantity back to available; refuse more than are out of use
 *   AC-4 available = total - damaged - under maintenance - reserved, everywhere
 *   AC-5 a shortage is warned about before saving, nothing is cancelled, and
 *        the affected Coordinators are told after saving (US-67)
 *   AC-8 simultaneous changes cannot exceed the limits
 *
 * AC-5's short flag on the event pages, and AC-6/AC-7 (resolving a shortage),
 * are in equipment-shortage.e2e-spec.ts.
 */
describe('US-45 mark a quantity of equipment damaged or under maintenance (e2e)', () => {
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

  const move = (
    from: EquipmentStatus,
    to: EquipmentStatus,
    quantity: number,
    reason = 'Cracked casing',
    who = 'tech',
    equipmentId = ids.mic,
  ) =>
    http()
      .patch(`/equipment/${equipmentId}/status`)
      .set('Authorization', as(who))
      .send({ from, to, quantity, reason });

  const condition = async (equipmentId = ids.mic) =>
    (await http().get(`/equipment/${equipmentId}/condition`).set('Authorization', as('tech')).expect(200)).body;

  const availability = (quantity: number, equipmentId = ids.mic) =>
    http()
      .get(`/equipment/${equipmentId}/availability`)
      .query({ start: START, end: END, quantity })
      .set('Authorization', as('tech'));

  const commit = (eventId: string, quantity: number, equipmentId = ids.mic) =>
    http()
      .post('/equipment/reservations')
      .set('Authorization', as('tech'))
      .send({ eventId, equipmentId, quantity });

  const upcoming = (query: Record<string, unknown> = {}) =>
    http()
      .get(`/equipment/${ids.mic}/upcoming-reservations`)
      .query(query)
      .set('Authorization', as('tech'));

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: key, role },
    });
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
    ids[key] = user.id;
  };

  const seedEvent = (name: string, coordinator = 'coordinator', start = START, end = END) =>
    prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        coordinatorId: ids[coordinator],
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
    status: ReservationStatus = ReservationStatus.APPROVED,
    start = START,
    end = END,
    equipmentId = ids.mic,
  ) =>
    prisma.equipmentReservation.create({
      data: { eventId, equipmentId, quantity, start: new Date(start), end: new Date(end), status },
    });

  const notices = (who: string, type: NotificationType) =>
    prisma.notification.findMany({ where: { recipientId: ids[who], type }, orderBy: { createdAt: 'asc' } });

  const clear = async () => {
    // Reservations first (their suggestions go with them), then equipment: its
    // status changes cascade with it, and hold a RESTRICT reference to users.
    await prisma.eventChange.deleteMany();
    await prisma.eventChangeRequest.deleteMany();
    await prisma.equipmentReservation.updateMany({ data: { replacedById: null } });
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
    await clear();
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await clear();

    await seedUser('tech', 'tech@example.com', Role.TECHNICAL_SUPPORT_STAFF);
    await seedUser('tech2', 'tech2@example.com', Role.TECHNICAL_SUPPORT_STAFF);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);
    await seedUser('coordinator2', 'coordinator2@example.com', Role.EVENT_COORDINATOR);
    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);

    ids.mic = (
      await prisma.equipment.create({
        data: { type: 'Wireless microphone', totalQuantity: 10, location: 'AV Store' },
      })
    ).id;
  });

  describe('US-45 AC-1: mark a quantity damaged or under maintenance', () => {
    it('US-45 AC-1: mark 2 of 10 damaged — the other 8 stay available', async () => {
      const res = await move(OPERATIONAL, OUT_OF_SERVICE, 2).expect(200);

      expect(res.body.condition).toEqual({
        equipmentId: ids.mic,
        totalQuantity: 10,
        workingQuantity: 8,
        damagedQuantity: 2,
        maintenanceQuantity: 0,
      });
      expect(await condition()).toEqual(res.body.condition);
      // Still lendable: the derived status stays Available while any unit works.
      expect(res.body.equipment.operationalStatus).toBe(OPERATIONAL);
    });

    it('US-45 AC-1: damaged and under maintenance are separate counts', async () => {
      await move(OPERATIONAL, OUT_OF_SERVICE, 2).expect(200);
      await move(OPERATIONAL, UNDER_MAINTENANCE, 3, 'Annual service').expect(200);

      expect(await condition()).toMatchObject({ workingQuantity: 5, damagedQuantity: 2, maintenanceQuantity: 3 });
    });

    it('US-45 AC-1: damaged units can be sent to maintenance', async () => {
      await move(OPERATIONAL, OUT_OF_SERVICE, 4).expect(200);
      await move(OUT_OF_SERVICE, UNDER_MAINTENANCE, 3, 'Sent for repair').expect(200);

      expect(await condition()).toMatchObject({ workingQuantity: 6, damagedQuantity: 1, maintenanceQuantity: 3 });
    });

    it('US-45 AC-1: with every unit out of use, the item reads as Damaged or Under Maintenance', async () => {
      await move(OPERATIONAL, UNDER_MAINTENANCE, 10).expect(200);
      const detail = await http().get(`/equipment/${ids.mic}`).set('Authorization', as('tech')).expect(200);
      expect(detail.body.operationalStatus).toBe(UNDER_MAINTENANCE);

      await move(UNDER_MAINTENANCE, OUT_OF_SERVICE, 1).expect(200);
      const after = await http().get(`/equipment/${ids.mic}`).set('Authorization', as('tech')).expect(200);
      expect(after.body.operationalStatus).toBe(OUT_OF_SERVICE);
    });

    it('US-45 AC-1: refuses marking more units than are working, with a clear message, and records nothing', async () => {
      await move(OPERATIONAL, OUT_OF_SERVICE, 2).expect(200);

      const res = await move(OPERATIONAL, OUT_OF_SERVICE, 9).expect(409);

      expect(res.body.message).toBe("Only 8 of 10 Wireless microphone are working, so 9 can't be marked damaged.");
      expect(await condition()).toMatchObject({ damagedQuantity: 2 });
      expect(await prisma.equipmentStatusChange.count()).toBe(1);
    });

    it('US-45 AC-1: refuses a move to the same status', async () => {
      const res = await move(OPERATIONAL, OPERATIONAL, 1).expect(409);
      expect(res.body.message).toBe('the units are already Available');
    });

    it.each([0, -1, 1.5, 'two'])('US-45 AC-1: 400s for a quantity of %p', async (quantity) => {
      await http()
        .patch(`/equipment/${ids.mic}/status`)
        .set('Authorization', as('tech'))
        .send({ from: OPERATIONAL, to: OUT_OF_SERVICE, quantity, reason: 'x' })
        .expect(400);
      expect(await condition()).toMatchObject({ damagedQuantity: 0 });
    });

    it('US-45 AC-1: 400s for a status that does not exist', async () => {
      await http()
        .patch(`/equipment/${ids.mic}/status`)
        .set('Authorization', as('tech'))
        .send({ from: OPERATIONAL, to: 'BROKEN', quantity: 1, reason: 'x' })
        .expect(400);
    });

    it('US-45 AC-1: 404s for an item that does not exist', async () => {
      await move(OPERATIONAL, OUT_OF_SERVICE, 1, 'x', 'tech', 'EQP-999999').expect(404);
    });

    it.each(['coordinator', 'organiser'])('US-45 AC-1: only Technical Support may change it (%s is refused)', async (who) => {
      await move(OPERATIONAL, OUT_OF_SERVICE, 1, 'x', who).expect(403);
      expect(await condition()).toMatchObject({ damagedQuantity: 0 });
    });

    it("US-45 AC-1: 401s, changing nothing, when the token's user no longer exists", async () => {
      await prisma.user.delete({ where: { id: ids.tech2 } });
      await move(OPERATIONAL, OUT_OF_SERVICE, 1, 'x', 'tech2').expect(401);
      expect(await condition()).toMatchObject({ damagedQuantity: 0 });
    });

    it('US-45 AC-1: is refused without a token', async () => {
      await http()
        .patch(`/equipment/${ids.mic}/status`)
        .send({ from: OPERATIONAL, to: OUT_OF_SERVICE, quantity: 1, reason: 'x' })
        .expect(401);
    });
  });

  describe('US-45 AC-2: a reason is required, and the history records the quantity', () => {
    it.each([undefined, '', '   '])('US-45 AC-2: 400s without a reason (%p), changing nothing', async (reason) => {
      await http()
        .patch(`/equipment/${ids.mic}/status`)
        .set('Authorization', as('tech'))
        .send({ from: OPERATIONAL, to: OUT_OF_SERVICE, quantity: 2, reason })
        .expect(400);

      expect(await condition()).toMatchObject({ damagedQuantity: 0 });
      expect(await prisma.equipmentStatusChange.count()).toBe(0);
    });

    it('US-45 AC-2: records the quantity, status, trimmed reason, who and when', async () => {
      const before = Date.now();
      await move(OPERATIONAL, OUT_OF_SERVICE, 2, '  Cracked lens  ').expect(200);

      const [entry] = (
        await http().get(`/equipment/${ids.mic}/status-history`).set('Authorization', as('tech')).expect(200)
      ).body;

      expect(entry).toMatchObject({
        fromStatus: OPERATIONAL,
        toStatus: OUT_OF_SERVICE,
        quantity: 2,
        reason: 'Cracked lens',
        changedBy: { id: ids.tech, name: 'tech' },
      });
      expect(entry.id).toMatch(/^ESC-\d{3,}$/);
      expect(new Date(entry.changedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    });

    it('US-45 AC-2: the history lists every change, newest first', async () => {
      await move(OPERATIONAL, OUT_OF_SERVICE, 2, 'first').expect(200);
      await move(OUT_OF_SERVICE, OPERATIONAL, 1, 'second').expect(200);

      const history = (
        await http().get(`/equipment/${ids.mic}/status-history`).set('Authorization', as('tech')).expect(200)
      ).body;
      expect(history.map((h: { reason: string; quantity: number }) => [h.reason, h.quantity])).toEqual([
        ['second', 1],
        ['first', 2],
      ]);
    });

    it('US-45 AC-2: the database refuses a blank reason or a zero quantity written around the API', async () => {
      const row = { equipmentId: ids.mic, fromStatus: OPERATIONAL, toStatus: OUT_OF_SERVICE, changedById: ids.tech };
      await expect(prisma.equipmentStatusChange.create({ data: { ...row, quantity: 1, reason: '  ' } })).rejects.toThrow();
      await expect(prisma.equipmentStatusChange.create({ data: { ...row, quantity: 0, reason: 'x' } })).rejects.toThrow();
    });

    it('US-45 AC-2: the database refuses an ID that is not in the readable format', async () => {
      await expect(
        prisma.equipmentStatusChange.create({
          data: {
            id: 'not-readable',
            equipmentId: ids.mic,
            fromStatus: OPERATIONAL,
            toStatus: OUT_OF_SERVICE,
            quantity: 1,
            reason: 'x',
            changedById: ids.tech,
          },
        }),
      ).rejects.toThrow();
      expect(await nextReadableId(prisma, 'EquipmentStatusChange')).toMatch(/^ESC-\d{3,}$/);
    });
  });

  describe('US-45 AC-3: set a quantity back to available', () => {
    it('US-45 AC-3: repairing a quantity restores availability by that amount', async () => {
      await move(OPERATIONAL, OUT_OF_SERVICE, 4).expect(200);
      expect((await availability(1).expect(200)).body.availableQuantity).toBe(6);

      await move(OUT_OF_SERVICE, OPERATIONAL, 3, 'Repaired and tested').expect(200);

      expect(await condition()).toMatchObject({ workingQuantity: 9, damagedQuantity: 1 });
      expect((await availability(1).expect(200)).body.availableQuantity).toBe(9);
    });

    it('US-45 AC-3: refuses repairing more than are damaged, with a clear message', async () => {
      await move(OPERATIONAL, OUT_OF_SERVICE, 2).expect(200);

      const res = await move(OUT_OF_SERVICE, OPERATIONAL, 3, 'Fixed').expect(409);

      expect(res.body.message).toBe("Only 2 Wireless microphone are damaged, so 3 can't be set back to available.");
      expect(await condition()).toMatchObject({ damagedQuantity: 2 });
    });

    it('US-45 AC-3: refuses repairing more than are under maintenance, with a clear message', async () => {
      const res = await move(UNDER_MAINTENANCE, OPERATIONAL, 1, 'Serviced').expect(409);
      expect(res.body.message).toBe(
        "Only 0 Wireless microphone are under maintenance, so 1 can't be set back to available.",
      );
    });

    it('US-45 AC-3: requires a reason to set them back too', async () => {
      await move(OPERATIONAL, OUT_OF_SERVICE, 2).expect(200);
      await http()
        .patch(`/equipment/${ids.mic}/status`)
        .set('Authorization', as('tech'))
        .send({ from: OUT_OF_SERVICE, to: OPERATIONAL, quantity: 2 })
        .expect(400);
      expect(await condition()).toMatchObject({ damagedQuantity: 2 });
    });
  });

  describe('US-45 AC-4: available = total - damaged - under maintenance - reserved', () => {
    it('US-45 AC-4 / US-29: the availability check subtracts each by its own amount', async () => {
      const event = await seedEvent('Gala');
      await seedReservation(event.id, 3);
      await move(OPERATIONAL, OUT_OF_SERVICE, 2).expect(200);
      await move(OPERATIONAL, UNDER_MAINTENANCE, 1, 'Service').expect(200);

      const res = await availability(4).expect(200);

      expect(res.body).toMatchObject({
        totalQuantity: 10,
        unavailableQuantity: 3,
        reservedQuantity: 3,
        availableQuantity: 4,
        fullyAvailable: true,
      });
    });

    it('US-45 AC-4 / US-31: a new reservation cannot use damaged or under-maintenance units', async () => {
      const event = await seedEvent('Gala');
      await move(OPERATIONAL, OUT_OF_SERVICE, 2).expect(200);
      await move(OPERATIONAL, UNDER_MAINTENANCE, 1, 'Service').expect(200);

      const refused = await commit(event.id, 8).expect(409);
      expect(refused.body.message).toBe(
        'Only 7 of the 8 Wireless microphone requested are free for ' +
          '2030-10-01T09:00:00.000Z – 2030-10-01T17:00:00.000Z: of 10, 2 are damaged, ' +
          '1 under maintenance, and 0 are already committed to an overlapping period.',
      );

      await commit(event.id, 7).expect(201);
    });

    it('US-45 AC-4 / US-31: every unit out of use is still refused outright', async () => {
      const event = await seedEvent('Gala');
      await move(OPERATIONAL, OUT_OF_SERVICE, 10).expect(200);

      const refused = await commit(event.id, 1).expect(409);
      expect(refused.body.message).toBe(
        'Wireless microphone is damaged (out of service), so none of it can be committed.',
      );
    });

    it('US-45 AC-4: the catalogue shows each item\'s breakdown', async () => {
      await move(OPERATIONAL, OUT_OF_SERVICE, 2).expect(200);
      const other = await prisma.equipment.create({ data: { type: 'Projector', totalQuantity: 4 } });

      const res = await http().get('/equipment/condition').set('Authorization', as('tech')).expect(200);

      expect(res.body).toEqual(
        expect.arrayContaining([
          { equipmentId: ids.mic, totalQuantity: 10, workingQuantity: 8, damagedQuantity: 2, maintenanceQuantity: 0 },
          { equipmentId: other.id, totalQuantity: 4, workingQuantity: 4, damagedQuantity: 0, maintenanceQuantity: 0 },
        ]),
      );
    });

    it('US-45 AC-4: the breakdown is Technical Support only', async () => {
      await http().get('/equipment/condition').set('Authorization', as('coordinator')).expect(403);
    });

    it('US-45 AC-4 / US-48: a change request check counts only working units', async () => {
      const event = await prisma.eventRequest.create({
        data: {
          organiserId: ids.organiser,
          coordinatorId: ids.coordinator,
          name: 'Conference',
          purpose: 'p',
          description: 'd',
          category: 'c',
          proposedStart: new Date(START),
          proposedEnd: new Date(END),
          expectedAttendance: 100,
          status: EventStatus.CONFIRMED,
        },
      });
      const requestFor = async (quantity: number) =>
        (
          await prisma.eventChangeRequest.create({
            data: {
              eventId: event.id,
              requestedById: ids.organiser,
              reason: 'More speakers.',
              equipmentChanged: true,
              equipment: { create: [{ equipmentId: ids.mic, quantity }] },
            },
          })
        ).id;
      await move(OPERATIONAL, OUT_OF_SERVICE, 2).expect(200);

      const tooMany = await requestFor(9);
      const review = await http()
        .get(`/events/change-requests/${tooMany}`)
        .set('Authorization', as('coordinator'))
        .expect(200);
      expect(review.body.check.equipment[0]).toMatchObject({
        available: false,
        reason: 'Only 8 of 9 Wireless microphone free for the new time.',
      });

      await prisma.eventChangeRequest.delete({ where: { id: tooMany } });
      const fits = await requestFor(8);
      const ok = await http().get(`/events/change-requests/${fits}`).set('Authorization', as('coordinator')).expect(200);
      expect(ok.body.check.equipment[0]).toMatchObject({ available: true });
    });
  });

  describe('US-45 AC-5: a shortage is warned about, nothing is cancelled, and Coordinators are told', () => {
    it('US-45 AC-5: before saving, the warning lists the reservations the change would leave short', async () => {
      const gala = await seedEvent('Gala');
      const fair = await seedEvent('Fair', 'coordinator', '2030-10-02T09:00:00.000Z', '2030-10-02T17:00:00.000Z');
      const galaRes = await seedReservation(gala.id, 9);
      await seedReservation(fair.id, 5, ReservationStatus.APPROVED, '2030-10-02T09:00:00.000Z', '2030-10-02T17:00:00.000Z');

      const res = await upcoming({ from: OPERATIONAL, to: OUT_OF_SERVICE, quantity: 2 }).expect(200);

      // 8 would work: Gala's 9 is short by 1; Fair's 5 still fits.
      expect(res.body.map((r: { event: { name: string }; quantity: number; shortBy: number; shortByAfter: number }) => [
        r.event.name,
        r.quantity,
        r.shortBy,
        r.shortByAfter,
      ])).toEqual([
        ['Gala', 9, 0, 1],
        ['Fair', 5, 0, 0],
      ]);
      expect(res.body[0]).toMatchObject({ id: galaRes.id, event: { coordinator: { id: ids.coordinator } } });
      // A preview: nothing changed.
      expect(await condition()).toMatchObject({ damagedQuantity: 0 });
    });

    it('US-45 AC-5: after saving, the reservations made short come back, and none is cancelled', async () => {
      const gala = await seedEvent('Gala');
      const galaRes = await seedReservation(gala.id, 9);

      const res = await move(OPERATIONAL, OUT_OF_SERVICE, 2).expect(200);

      expect(res.body.affectedReservations).toEqual([
        expect.objectContaining({ id: galaRes.id, quantity: 9, shortBy: 1, event: expect.objectContaining({ name: 'Gala' }) }),
      ]);
      expect(await prisma.equipmentReservation.findUniqueOrThrow({ where: { id: galaRes.id } })).toMatchObject({
        status: ReservationStatus.APPROVED,
        quantity: 9,
      });
    });

    it('US-45 AC-5: past reservations are neither listed nor counted', async () => {
      const past = await seedEvent('Last year', 'coordinator', '2020-10-01T09:00:00.000Z', '2020-10-01T17:00:00.000Z');
      await seedReservation(past.id, 10, ReservationStatus.APPROVED, '2020-10-01T09:00:00.000Z', '2020-10-01T17:00:00.000Z');

      expect((await upcoming({ from: OPERATIONAL, to: OUT_OF_SERVICE, quantity: 10 }).expect(200)).body).toEqual([]);
      const res = await move(OPERATIONAL, OUT_OF_SERVICE, 10).expect(200);
      expect(res.body.affectedReservations).toEqual([]);
      expect(await notices('coordinator', NotificationType.EQUIPMENT_UNAVAILABLE)).toHaveLength(0);
    });

    it('US-45 AC-5: released, rejected and requested reservations hold nothing and are not listed', async () => {
      const gala = await seedEvent('Gala');
      await seedReservation(gala.id, 9, ReservationStatus.RELEASED);
      await seedReservation(gala.id, 9, ReservationStatus.REJECTED);
      await seedReservation(gala.id, 9, ReservationStatus.REQUESTED);

      expect((await upcoming().expect(200)).body).toEqual([]);
      expect((await move(OPERATIONAL, OUT_OF_SERVICE, 10).expect(200)).body.affectedReservations).toEqual([]);
    });

    it('US-45 AC-5 / US-67: each affected Coordinator is told once, with the quantity and how many short', async () => {
      const gala = await seedEvent('Gala');
      const fair = await seedEvent('Fair', 'coordinator2');
      await seedReservation(gala.id, 6);
      await seedReservation(fair.id, 4);

      await move(OPERATIONAL, OUT_OF_SERVICE, 3, 'Water damage').expect(200);

      const [toMarcus] = await notices('coordinator', NotificationType.EQUIPMENT_UNAVAILABLE);
      const [toFatima] = await notices('coordinator2', NotificationType.EQUIPMENT_UNAVAILABLE);
      // 7 work for 10 reserved at once: both are short by 3.
      expect(toMarcus).toMatchObject({
        relatedEventId: gala.id,
        message:
          '3 of 10 "Wireless microphone" are now damaged: the reservation for your event "Gala" ' +
          'is affected and is short by 3. Reason: Water damage',
      });
      expect(toFatima.message).toContain('"Fair" is affected and is short by 3');
    });

    it('US-45 AC-5 / US-67: nobody is told when the remaining units still cover every reservation', async () => {
      const gala = await seedEvent('Gala');
      await seedReservation(gala.id, 5);

      const res = await move(OPERATIONAL, OUT_OF_SERVICE, 5).expect(200);

      expect(res.body.affectedReservations).toEqual([]);
      expect(await notices('coordinator', NotificationType.EQUIPMENT_UNAVAILABLE)).toHaveLength(0);
    });

    it('US-45 AC-5 / US-67: a reservation already short is reported again only if it gets shorter', async () => {
      const gala = await seedEvent('Gala');
      await seedReservation(gala.id, 9);
      await move(OPERATIONAL, OUT_OF_SERVICE, 2).expect(200); // short by 1
      await move(OUT_OF_SERVICE, UNDER_MAINTENANCE, 1, 'To the workshop').expect(200); // still short by 1

      const notified = await notices('coordinator', NotificationType.EQUIPMENT_UNAVAILABLE);
      expect(notified).toHaveLength(1);

      await move(OPERATIONAL, UNDER_MAINTENANCE, 1, 'Service').expect(200); // short by 2
      expect(await notices('coordinator', NotificationType.EQUIPMENT_UNAVAILABLE)).toHaveLength(2);
    });

    it('US-45 / US-60: the other Technical Support members are told the quantity; the actor is not', async () => {
      await move(OPERATIONAL, OUT_OF_SERVICE, 2, 'Cracked lens').expect(200);

      const [notice] = await notices('tech2', NotificationType.EQUIPMENT_STATUS_CHANGED);
      expect(notice).toMatchObject({
        relatedEquipmentId: ids.mic,
        message: '2 of 10 Wireless microphone marked Damaged by tech. Reason: Cracked lens',
      });
      expect(await notices('tech', NotificationType.EQUIPMENT_STATUS_CHANGED)).toHaveLength(0);
    });

    it('US-45 / US-60: setting units back to available tells no one', async () => {
      await move(OPERATIONAL, OUT_OF_SERVICE, 2).expect(200);
      await prisma.notification.deleteMany();

      await move(OUT_OF_SERVICE, OPERATIONAL, 2, 'Repaired').expect(200);

      expect(await prisma.notification.count()).toBe(0);
    });

    it('US-45 AC-5: the preview is Technical Support only, and 404s for an unknown item', async () => {
      await http().get(`/equipment/${ids.mic}/upcoming-reservations`).set('Authorization', as('coordinator')).expect(403);
      await http().get('/equipment/EQP-999999/upcoming-reservations').set('Authorization', as('tech')).expect(404);
    });
  });

  describe('US-45 AC-8: simultaneous changes cannot exceed the limits', () => {
    it('US-45 AC-8: two simultaneous marks of 6 of 10 — exactly one succeeds', async () => {
      const results = await Promise.all([
        move(OPERATIONAL, OUT_OF_SERVICE, 6, 'first'),
        move(OPERATIONAL, UNDER_MAINTENANCE, 6, 'second', 'tech2'),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const after = await condition();
      expect(after.damagedQuantity + after.maintenanceQuantity).toBe(6);
      expect(await prisma.equipmentStatusChange.count()).toBe(1);
    });

    it('US-45 AC-8: two simultaneous repairs of the same 3 damaged units — exactly one succeeds', async () => {
      await move(OPERATIONAL, OUT_OF_SERVICE, 3).expect(200);

      const results = await Promise.all([
        move(OUT_OF_SERVICE, OPERATIONAL, 3, 'first'),
        move(OUT_OF_SERVICE, OPERATIONAL, 3, 'second', 'tech2'),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await condition()).toMatchObject({ damagedQuantity: 0, workingQuantity: 10 });
    });

    it('US-45 AC-8: a mark and a reservation at the same time never over-commit the working units', async () => {
      const event = await seedEvent('Gala');

      const [marked, reserved] = await Promise.all([move(OPERATIONAL, OUT_OF_SERVICE, 4), commit(event.id, 8)]);

      expect(marked.status).toBe(200);
      // Either the reservation landed first (and is now short), or it came
      // second and was refused because only 6 work: never 8 on 6 silently.
      if (reserved.status === 201) {
        expect(marked.body.affectedReservations).toEqual([expect.objectContaining({ quantity: 8, shortBy: 2 })]);
      } else {
        expect(reserved.status).toBe(409);
      }
    });

    it('US-45 AC-8: the database itself refuses counts over the total', async () => {
      await expect(
        prisma.equipment.update({ where: { id: ids.mic }, data: { damagedQuantity: 6, maintenanceQuantity: 5 } }),
      ).rejects.toThrow(/Equipment_out_of_use_within_total/);
    });
  });
});
