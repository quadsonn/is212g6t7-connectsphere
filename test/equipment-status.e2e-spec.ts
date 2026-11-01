import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EquipmentStatus, NotificationType, PrismaClient, ReservationStatus } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { nextReadableId } from '../src/prisma/readable-id';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

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
 *
 * The names above follow the reopened story's numbering. The written test
 * cases (docs/testing/sprint3-test-cases.md, TC-S3-88 to 98) follow the
 * Sprint 3 card's eleven ACs; each test's tag names both.
 *
 * Pre-condition for every test: reset the testDB, then run tc-s3-88-setup.sql
 * (tech, tech2, coordinator, coordinator2, otherCoordinator, organiser) and
 * tc-s3-88b-setup.sql (Wireless microphone EQP-033, 10 working). Each test
 * loads the scripts its test case names.
 */
describe('US-45 mark a quantity of equipment damaged or under maintenance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  /** Fixed rows from tc-s3-88-setup, tc-s3-88b-setup and tc-s3-92-setup. */
  const ids: Record<string, string> = {
    tech: 'USR-046',
    tech2: 'USR-047',
    coordinator: 'USR-048',
    coordinator2: 'USR-049',
    organiser: 'USR-051',
    mic: 'EQP-033',
    gala: 'EVT-317',
  };
  const LOGINS = ['tech', 'tech2', 'coordinator', 'coordinator2', 'organiser'];

  // Far enough ahead to stay "upcoming" whenever the suite runs.
  const START = '2030-10-01T09:00:00.000Z';
  const END = '2030-10-01T17:00:00.000Z';

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };
  const eventRow = (id: string) => prisma.eventRequest.findUniqueOrThrow({ where: { id } });
  const reservationRow = (id: string) => prisma.equipmentReservation.findUniqueOrThrow({ where: { id } });

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

  const notices = (who: string, type: NotificationType) =>
    prisma.notification.findMany({ where: { recipientId: ids[who], type }, orderBy: { createdAt: 'asc' } });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');

    prisma = new PrismaClient();

    // Users keep their fixed IDs after every reset, so these tokens stay valid.
    await resetDb(prisma);
    await given('tc-s3-88-setup');
    for (const who of LOGINS) {
      const res = await http().post('/auth/login').send({ email: `${who}@example.com`, password: PASSWORD }).expect(200);
      tokens[who] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await given('tc-s3-88-setup', 'tc-s3-88b-setup');
  });

  describe('US-45 AC-1: mark a quantity damaged or under maintenance', () => {
    // TC-S3-88 · US-45 AC-1 · setup: tc-s3-88 + tc-s3-88b · fails if marking 2 of 10 damaged does not leave 8 working, or the item stops being lendable
    // Code: EquipmentService.changeStatus (statusMoveError, applyStatusMove); findCondition
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

    // TC-S3-88 · US-45 AC-1 · setup: tc-s3-88 + tc-s3-88b · fails if damaged and under-maintenance units share one count
    // Code: applyStatusMove (damagedQuantity / maintenanceQuantity)
    it('US-45 AC-1: damaged and under maintenance are separate counts', async () => {
      await move(OPERATIONAL, OUT_OF_SERVICE, 2).expect(200);
      await move(OPERATIONAL, UNDER_MAINTENANCE, 3, 'Annual service').expect(200);

      expect(await condition()).toMatchObject({ workingQuantity: 5, damagedQuantity: 2, maintenanceQuantity: 3 });
    });

    // TC-S3-88 · US-45 AC-1 · setup: tc-s3-88 + tc-s3-88b · fails if damaged units cannot move straight to maintenance
    // Code: applyStatusMove (OUT_OF_SERVICE -> UNDER_MAINTENANCE)
    it('US-45 AC-1: damaged units can be sent to maintenance', async () => {
      await move(OPERATIONAL, OUT_OF_SERVICE, 4).expect(200);
      await move(OUT_OF_SERVICE, UNDER_MAINTENANCE, 3, 'Sent for repair').expect(200);

      expect(await condition()).toMatchObject({ workingQuantity: 6, damagedQuantity: 1, maintenanceQuantity: 3 });
    });

    // TC-S3-88 · US-45 AC-1 · setup: tc-s3-88 + tc-s3-88b · fails if an item with no working unit still reads as Available
    // Code: EquipmentService.findDetail (status derived from the counts)
    it('US-45 AC-1: with every unit out of use, the item reads as Damaged or Under Maintenance', async () => {
      await move(OPERATIONAL, UNDER_MAINTENANCE, 10).expect(200);
      const detail = await http().get(`/equipment/${ids.mic}`).set('Authorization', as('tech')).expect(200);
      expect(detail.body.operationalStatus).toBe(UNDER_MAINTENANCE);

      await move(UNDER_MAINTENANCE, OUT_OF_SERVICE, 1).expect(200);
      const after = await http().get(`/equipment/${ids.mic}`).set('Authorization', as('tech')).expect(200);
      expect(after.body.operationalStatus).toBe(OUT_OF_SERVICE);
    });

    // TC-S3-91 · US-45 AC-4 · setup: tc-s3-88 + tc-s3-88b · fails if more units than are working can be marked, the message is unclear, or a refused change is recorded
    // Code: statusMoveError (fewer working than asked)
    it('US-45 AC-1: refuses marking more units than are working, with a clear message, and records nothing', async () => {
      await move(OPERATIONAL, OUT_OF_SERVICE, 2).expect(200);

      const res = await move(OPERATIONAL, OUT_OF_SERVICE, 9).expect(409);

      expect(res.body.message).toBe("Only 8 of 10 Wireless microphone are working, so 9 can't be marked damaged.");
      expect(await condition()).toMatchObject({ damagedQuantity: 2 });
      expect(await prisma.equipmentStatusChange.count()).toBe(1);
    });

    // TC-S3-91 · US-45 AC-4 · setup: tc-s3-88 + tc-s3-88b · fails if a move to the same status is accepted
    // Code: statusMoveError (from === to)
    it('US-45 AC-1: refuses a move to the same status', async () => {
      const res = await move(OPERATIONAL, OPERATIONAL, 1).expect(409);
      expect(res.body.message).toBe('the units are already Available');
    });

    // TC-S3-88 · US-45 AC-1 · setup: tc-s3-88 + tc-s3-88b · fails if a zero, negative, fractional or non-numeric quantity is accepted
    // Code: ChangeEquipmentStatusDto (quantity: positive integer)
    it.each([0, -1, 1.5, 'two'])('US-45 AC-1: 400s for a quantity of %p', async (quantity) => {
      await http()
        .patch(`/equipment/${ids.mic}/status`)
        .set('Authorization', as('tech'))
        .send({ from: OPERATIONAL, to: OUT_OF_SERVICE, quantity, reason: 'x' })
        .expect(400);
      expect(await condition()).toMatchObject({ damagedQuantity: 0 });
    });

    // TC-S3-88 · US-45 AC-1 · setup: tc-s3-88 + tc-s3-88b · fails if an unknown status is accepted
    // Code: ChangeEquipmentStatusDto (to: EquipmentStatus)
    it('US-45 AC-1: 400s for a status that does not exist', async () => {
      await http()
        .patch(`/equipment/${ids.mic}/status`)
        .set('Authorization', as('tech'))
        .send({ from: OPERATIONAL, to: 'BROKEN', quantity: 1, reason: 'x' })
        .expect(400);
    });

    // TC-S3-88 · US-45 AC-1 · setup: tc-s3-88 + tc-s3-88b · fails if an unknown item does not 404
    // Code: EquipmentService.changeStatus (lock finds no row)
    it('US-45 AC-1: 404s for an item that does not exist', async () => {
      await move(OPERATIONAL, OUT_OF_SERVICE, 1, 'x', 'tech', 'EQP-999999').expect(404);
    });

    // TC-S3-88 · US-45 AC-1 · setup: tc-s3-88 + tc-s3-88b · fails if another role can change the status
    // Code: EquipmentController.changeStatus (@Roles TECHNICAL_SUPPORT_STAFF)
    it.each(['coordinator', 'organiser'])('US-45 AC-1: only Technical Support may change it (%s is refused)', async (who) => {
      await move(OPERATIONAL, OUT_OF_SERVICE, 1, 'x', who).expect(403);
      expect(await condition()).toMatchObject({ damagedQuantity: 0 });
    });

    // TC-S3-89 · US-45 AC-2 · setup: tc-s3-88 + tc-s3-88b · fails if a change is saved for a user who no longer exists
    // Code: EquipmentService.changeStatus (author missing -> 401)
    it("US-45 AC-1: 401s, changing nothing, when the token's user no longer exists", async () => {
      // Kept by design: the token must outlive its user.
      await prisma.user.delete({ where: { id: ids.tech2 } });
      await move(OPERATIONAL, OUT_OF_SERVICE, 1, 'x', 'tech2').expect(401);
      expect(await condition()).toMatchObject({ damagedQuantity: 0 });
    });

    // TC-S3-88 · US-45 AC-1 · setup: tc-s3-88 + tc-s3-88b · fails if the status can be changed without logging in
    // Code: JwtAuthGuard
    it('US-45 AC-1: is refused without a token', async () => {
      await http()
        .patch(`/equipment/${ids.mic}/status`)
        .send({ from: OPERATIONAL, to: OUT_OF_SERVICE, quantity: 1, reason: 'x' })
        .expect(401);
    });
  });

  describe('US-45 AC-2: a reason is required, and the history records the quantity', () => {
    // TC-S3-89 · US-45 AC-2 · setup: tc-s3-88 + tc-s3-88b · fails if a missing, empty or blank reason is accepted, or anything changes
    // Code: ChangeEquipmentStatusDto (reason: trimmed, required)
    it.each([undefined, '', '   '])('US-45 AC-2: 400s without a reason (%p), changing nothing', async (reason) => {
      await http()
        .patch(`/equipment/${ids.mic}/status`)
        .set('Authorization', as('tech'))
        .send({ from: OPERATIONAL, to: OUT_OF_SERVICE, quantity: 2, reason })
        .expect(400);

      expect(await condition()).toMatchObject({ damagedQuantity: 0 });
      expect(await prisma.equipmentStatusChange.count()).toBe(0);
    });

    // TC-S3-89 · US-45 AC-2 · setup: tc-s3-88 + tc-s3-88b · fails if the history misses the quantity, statuses, trimmed reason, who or when
    // Code: EquipmentService.changeStatus (equipmentStatusChange.create); EquipmentService.findStatusHistory
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

    // TC-S3-89 · US-45 AC-2 · setup: tc-s3-88 + tc-s3-88b · fails if the history misses a change or is not newest first
    // Code: EquipmentService.findStatusHistory (newest first)
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

    // TC-S3-89 · US-45 AC-2 · setup: tc-s3-88 + tc-s3-88b · fails if the database accepts a blank reason or a zero quantity
    // Code: EquipmentStatusChange_has_reason / EquipmentStatusChange_quantity_positive CHECKs
    it('US-45 AC-2: the database refuses a blank reason or a zero quantity written around the API', async () => {
      const row = { equipmentId: ids.mic, fromStatus: OPERATIONAL, toStatus: OUT_OF_SERVICE, changedById: ids.tech };
      await expect(prisma.equipmentStatusChange.create({ data: { ...row, quantity: 1, reason: '  ' } })).rejects.toThrow();
      await expect(prisma.equipmentStatusChange.create({ data: { ...row, quantity: 0, reason: 'x' } })).rejects.toThrow();
    });

    // TC-S3-89 · US-45 AC-2 · setup: tc-s3-88 + tc-s3-88b · fails if a status change can be stored with an ID not in the readable format
    // Code: EquipmentStatusChange id CHECK; next_readable_id
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

    // TC-S3-89 · US-45 AC-2 · setup: tc-s3-88 + tc-s3-88b · fails if a reason that is not text is accepted, or anything changes
    // Code: ChangeEquipmentStatusDto (reason: @IsString after the trim)
    it('US-45 AC-2: 400s for a reason that is not text, changing nothing', async () => {
      await http()
        .patch(`/equipment/${ids.mic}/status`)
        .set('Authorization', as('tech'))
        .send({ from: OPERATIONAL, to: OUT_OF_SERVICE, quantity: 2, reason: 42 })
        .expect(400);

      expect(await condition()).toMatchObject({ damagedQuantity: 0 });
    });
  });

  describe('US-45 AC-3: set a quantity back to available', () => {
    // TC-S3-90 · US-45 AC-3 · setup: tc-s3-88 + tc-s3-88b · fails if setting units back does not restore availability by that amount
    // Code: applyStatusMove (back to OPERATIONAL); computeItemAvailability
    it('US-45 AC-3: repairing a quantity restores availability by that amount', async () => {
      await move(OPERATIONAL, OUT_OF_SERVICE, 4).expect(200);
      expect((await availability(1).expect(200)).body.availableQuantity).toBe(6);

      await move(OUT_OF_SERVICE, OPERATIONAL, 3, 'Repaired and tested').expect(200);

      expect(await condition()).toMatchObject({ workingQuantity: 9, damagedQuantity: 1 });
      expect((await availability(1).expect(200)).body.availableQuantity).toBe(9);
    });

    // TC-S3-91 · US-45 AC-4 · setup: tc-s3-88 + tc-s3-88b · fails if more units than are damaged can be set back, or the message is unclear
    // Code: statusMoveError (fewer damaged than asked)
    it('US-45 AC-3: refuses repairing more than are damaged, with a clear message', async () => {
      await move(OPERATIONAL, OUT_OF_SERVICE, 2).expect(200);

      const res = await move(OUT_OF_SERVICE, OPERATIONAL, 3, 'Fixed').expect(409);

      expect(res.body.message).toBe("Only 2 Wireless microphone are damaged, so 3 can't be set back to available.");
      expect(await condition()).toMatchObject({ damagedQuantity: 2 });
    });

    // TC-S3-91 · US-45 AC-4 · setup: tc-s3-88 + tc-s3-88b · fails if more units than are under maintenance can be set back, or the message is unclear
    // Code: statusMoveError (fewer under maintenance than asked)
    it('US-45 AC-3: refuses repairing more than are under maintenance, with a clear message', async () => {
      const res = await move(UNDER_MAINTENANCE, OPERATIONAL, 1, 'Serviced').expect(409);
      expect(res.body.message).toBe(
        "Only 0 Wireless microphone are under maintenance, so 1 can't be set back to available.",
      );
    });

    // TC-S3-90 · US-45 AC-3 · setup: tc-s3-88 + tc-s3-88b · fails if units can be set back without a reason
    // Code: ChangeEquipmentStatusDto (reason required)
    it('US-45 AC-3: requires a reason to set them back too', async () => {
      await move(OPERATIONAL, OUT_OF_SERVICE, 2).expect(200);
      await http()
        .patch(`/equipment/${ids.mic}/status`)
        .set('Authorization', as('tech'))
        .send({ from: OUT_OF_SERVICE, to: OPERATIONAL, quantity: 2 })
        .expect(400);
      expect(await condition()).toMatchObject({ damagedQuantity: 2 });
    });

    // TC-S3-91 · US-45 AC-4 · setup: tc-s3-88 + tc-s3-88b · fails if more units than are damaged can be sent to maintenance, or the message is unclear
    // Code: statusMoveError (fewer damaged than asked, to UNDER_MAINTENANCE)
    it('US-45 AC-1: refuses sending more units to maintenance than are damaged, with a clear message', async () => {
      await move(OPERATIONAL, OUT_OF_SERVICE, 2).expect(200);

      const res = await move(OUT_OF_SERVICE, UNDER_MAINTENANCE, 3, 'To the workshop').expect(409);

      expect(res.body.message).toBe("Only 2 Wireless microphone are damaged, so 3 can't be moved to under maintenance.");
      expect(await condition()).toMatchObject({ damagedQuantity: 2, maintenanceQuantity: 0 });
    });
  });

  describe('US-45 AC-4: available = total - damaged - under maintenance - reserved', () => {
    // TC-S3-92 · US-45 AC-5 · setup: tc-s3-88 + tc-s3-88b + tc-s3-92 + tc-s3-92b · fails if availability does not subtract damaged, under-maintenance and reserved units each by their own amount
    // Code: computeItemAvailability (total - damaged - maintenance - reserved)
    it('US-45 AC-4 / US-29: the availability check subtracts each by its own amount', async () => {
      await given('tc-s3-92-setup', 'tc-s3-92b-setup');
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

    // TC-S3-92 · US-45 AC-5 · setup: tc-s3-88 + tc-s3-88b + tc-s3-92 · fails if a reservation can use damaged or under-maintenance units, or the refusal does not explain why
    // Code: EquipmentReservationsService (working units only)
    it('US-45 AC-4 / US-31: a new reservation cannot use damaged or under-maintenance units', async () => {
      await given('tc-s3-92-setup');
      const event = await eventRow(ids.gala);
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

    // TC-S3-92 · US-45 AC-5 · setup: tc-s3-88 + tc-s3-88b + tc-s3-92 · fails if a reservation is accepted when no unit works
    // Code: EquipmentReservationsService (isLendable)
    it('US-45 AC-4 / US-31: every unit out of use is still refused outright', async () => {
      await given('tc-s3-92-setup');
      const event = await eventRow(ids.gala);
      await move(OPERATIONAL, OUT_OF_SERVICE, 10).expect(200);

      const refused = await commit(event.id, 1).expect(409);
      expect(refused.body.message).toBe(
        'Wireless microphone is damaged (out of service), so none of it can be committed.',
      );
    });

    // TC-S3-92 · US-45 AC-5 · setup: tc-s3-88 + tc-s3-88b + tc-s3-92c · fails if the catalogue does not show each item's working, damaged and under-maintenance counts
    // Code: EquipmentService.findConditions
    it('US-45 AC-4: the catalogue shows each item\'s breakdown', async () => {
      await move(OPERATIONAL, OUT_OF_SERVICE, 2).expect(200);
      await given('tc-s3-92c-setup');
      const other = await prisma.equipment.findUniqueOrThrow({ where: { id: 'EQP-037' } });

      const res = await http().get('/equipment/condition').set('Authorization', as('tech')).expect(200);

      expect(res.body).toEqual(
        expect.arrayContaining([
          { equipmentId: ids.mic, totalQuantity: 10, workingQuantity: 8, damagedQuantity: 2, maintenanceQuantity: 0 },
          { equipmentId: other.id, totalQuantity: 4, workingQuantity: 4, damagedQuantity: 0, maintenanceQuantity: 0 },
        ]),
      );
    });

    // TC-S3-92 · US-45 AC-5 · setup: tc-s3-88 + tc-s3-88b · fails if another role can read the breakdown
    // Code: EquipmentController.findConditions (@Roles TECHNICAL_SUPPORT_STAFF)
    it('US-45 AC-4: the breakdown is Technical Support only', async () => {
      await http().get('/equipment/condition').set('Authorization', as('coordinator')).expect(403);
    });

    // TC-S3-92 · US-45 AC-5 · setup: tc-s3-88 + tc-s3-88b · fails if an unknown item's breakdown does not 404
    // Code: EquipmentService.findCondition (404)
    it("US-45 AC-4: 404s for an unknown item's breakdown", async () => {
      await http().get('/equipment/EQP-999999/condition').set('Authorization', as('tech')).expect(404);
    });

    // TC-S3-92 · US-45 AC-5 · setup: tc-s3-88 + tc-s3-88b + tc-s3-92d · fails if a change request check counts damaged units as free
    // Code: change-arrangement-check.ts (free units after damaged and under maintenance)
    it('US-45 AC-4 / US-48: a change request check counts only working units', async () => {
      await given('tc-s3-92d-setup');
      const event = await eventRow('EVT-321');
      // Kept by design: change requests are written directly, after the
      // status change, so each check reads the new counts (US-48).
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
    // TC-S3-93 · US-45 AC-6 · setup: tc-s3-88 + tc-s3-88b + tc-s3-92 + tc-s3-93 + tc-s3-93b · fails if the warning misses a reservation the change would leave short, the short count is wrong, or the preview changes anything
    // Code: EquipmentService.findUpcomingReservations (upcomingWithShortages, workingAfter preview)
    it('US-45 AC-5: before saving, the warning lists the reservations the change would leave short', async () => {
      await given('tc-s3-92-setup', 'tc-s3-93-setup', 'tc-s3-93b-setup');
      const galaRes = await reservationRow('RSV-043');

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

    // TC-S3-93, TC-S3-94 · US-45 AC-6, AC-7 · setup: tc-s3-88 + tc-s3-88b + tc-s3-92 + tc-s3-93 · fails if the change does not return the reservations it made short, or cancels any
    // Code: EquipmentService.changeStatus (affectedReservations; nothing cancelled)
    it('US-45 AC-5: after saving, the reservations made short come back, and none is cancelled', async () => {
      await given('tc-s3-92-setup', 'tc-s3-93-setup');
      const galaRes = await reservationRow('RSV-043');

      const res = await move(OPERATIONAL, OUT_OF_SERVICE, 2).expect(200);

      expect(res.body.affectedReservations).toEqual([
        expect.objectContaining({ id: galaRes.id, quantity: 9, shortBy: 1, event: expect.objectContaining({ name: 'Gala' }) }),
      ]);
      expect(await prisma.equipmentReservation.findUniqueOrThrow({ where: { id: galaRes.id } })).toMatchObject({
        status: ReservationStatus.APPROVED,
        quantity: 9,
      });
    });

    // TC-S3-93, TC-S4-107 · US-45 AC-6, US-67 AC-1 · setup: tc-s3-88 + tc-s3-88b + tc-s3-93c · fails if a reservation already over is listed, counted or notified
    // Code: upcomingReservationsWhere (end > now)
    it('US-45 AC-5: past reservations are neither listed nor counted', async () => {
      await given('tc-s3-93c-setup');

      expect((await upcoming({ from: OPERATIONAL, to: OUT_OF_SERVICE, quantity: 10 }).expect(200)).body).toEqual([]);
      const res = await move(OPERATIONAL, OUT_OF_SERVICE, 10).expect(200);
      expect(res.body.affectedReservations).toEqual([]);
      expect(await notices('coordinator', NotificationType.EQUIPMENT_UNAVAILABLE)).toHaveLength(0);
    });

    // TC-S3-93 · US-45 AC-6 · setup: tc-s3-88 + tc-s3-88b + tc-s3-92 + tc-s3-93d · fails if a reservation that holds nothing is listed or counted
    // Code: upcomingReservationsWhere (HOLDING_STATUSES)
    it('US-45 AC-5: released, rejected and requested reservations hold nothing and are not listed', async () => {
      await given('tc-s3-92-setup', 'tc-s3-93d-setup');

      expect((await upcoming().expect(200)).body).toEqual([]);
      expect((await move(OPERATIONAL, OUT_OF_SERVICE, 10).expect(200)).body.affectedReservations).toEqual([]);
    });

    // TC-S4-107 · US-67 AC-1 · setup: tc-s3-88 + tc-s3-88b + tc-s3-92 + tc-s4-107 · fails if an affected event's Coordinator is not told once, with the quantity and how many short
    // Code: EquipmentNotifier.unavailable (one per event)
    it('US-45 AC-5 / US-67: each affected Coordinator is told once, with the quantity and how many short', async () => {
      await given('tc-s3-92-setup', 'tc-s4-107-setup');
      const gala = await eventRow(ids.gala);

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

    // TC-S4-107 · US-67 AC-1 · setup: tc-s3-88 + tc-s3-88b + tc-s3-92 + tc-s4-107b · fails if a Coordinator is told although every reservation still fits
    // Code: EquipmentService.changeStatus (only reservations made shorter)
    it('US-45 AC-5 / US-67: nobody is told when the remaining units still cover every reservation', async () => {
      await given('tc-s3-92-setup', 'tc-s4-107b-setup');

      const res = await move(OPERATIONAL, OUT_OF_SERVICE, 5).expect(200);

      expect(res.body.affectedReservations).toEqual([]);
      expect(await notices('coordinator', NotificationType.EQUIPMENT_UNAVAILABLE)).toHaveLength(0);
    });

    // TC-S4-107 · US-67 AC-1 · setup: tc-s3-88 + tc-s3-88b + tc-s3-92 + tc-s3-93 · fails if a reservation is reported again without getting shorter, or not when it does
    // Code: EquipmentService.changeStatus (shortBy > before)
    it('US-45 AC-5 / US-67: a reservation already short is reported again only if it gets shorter', async () => {
      await given('tc-s3-92-setup', 'tc-s3-93-setup');
      await move(OPERATIONAL, OUT_OF_SERVICE, 2).expect(200); // short by 1
      await move(OUT_OF_SERVICE, UNDER_MAINTENANCE, 1, 'To the workshop').expect(200); // still short by 1

      const notified = await notices('coordinator', NotificationType.EQUIPMENT_UNAVAILABLE);
      expect(notified).toHaveLength(1);

      await move(OPERATIONAL, UNDER_MAINTENANCE, 1, 'Service').expect(200); // short by 2
      expect(await notices('coordinator', NotificationType.EQUIPMENT_UNAVAILABLE)).toHaveLength(2);
    });

    // TC-S4-109 · US-67 AC-1, AC-3 · setup: tc-s3-88 + tc-s3-88b + tc-s4-109 · fails if an affected event with no Coordinator tells nobody instead of the Leads
    // Code: EquipmentService.changeStatus (coordinator?.id ?? null) -> EquipmentNotifier.unavailable (Lead fall-back)
    it('US-45 AC-5 / US-67: an event with no Coordinator yet — the Coordinator Leads are told', async () => {
      await given('tc-s4-109-setup');

      await move(OPERATIONAL, OUT_OF_SERVICE, 2).expect(200);

      const toLead = await prisma.notification.findMany({
        where: { recipientId: 'USR-052', type: NotificationType.EQUIPMENT_UNAVAILABLE },
      });
      expect(toLead).toEqual([
        expect.objectContaining({ relatedEventId: 'EVT-326', message: expect.stringContaining('"Unassigned" is affected and is short by 1') }),
      ]);
    });

    // TC-S4-73, TC-S4-74 · US-60 AC-1, AC-2 · setup: tc-s3-88 + tc-s3-88b · fails if the other Technical Support members are not told the quantity, or the actor is
    // Code: EquipmentStatusNotifier.statusChanged
    it('US-45 / US-60: the other Technical Support members are told the quantity; the actor is not', async () => {
      await move(OPERATIONAL, OUT_OF_SERVICE, 2, 'Cracked lens').expect(200);

      const [notice] = await notices('tech2', NotificationType.EQUIPMENT_STATUS_CHANGED);
      expect(notice).toMatchObject({
        relatedEquipmentId: ids.mic,
        message: '2 of 10 Wireless microphone marked Damaged by tech. Reason: Cracked lens',
      });
      expect(await notices('tech', NotificationType.EQUIPMENT_STATUS_CHANGED)).toHaveLength(0);
    });

    // TC-S4-73 · US-60 AC-1 · setup: tc-s3-88 + tc-s3-88b · fails if setting units back notifies anyone
    // Code: EquipmentStatusNotifier (only OUT_OF_SERVICE / UNDER_MAINTENANCE)
    it('US-45 / US-60: setting units back to available tells no one', async () => {
      await move(OPERATIONAL, OUT_OF_SERVICE, 2).expect(200);
      // Kept by design: clears the first change's notices, so only the second is counted.
      await prisma.notification.deleteMany();

      await move(OUT_OF_SERVICE, OPERATIONAL, 2, 'Repaired').expect(200);

      expect(await prisma.notification.count()).toBe(0);
    });

    // TC-S3-93 · US-45 AC-6 · setup: tc-s3-88 + tc-s3-88b · fails if another role can read the warning, or an unknown item does not 404
    // Code: EquipmentController.findUpcomingReservations (@Roles); EquipmentService.findUpcomingReservations (404)
    it('US-45 AC-5: the preview is Technical Support only, and 404s for an unknown item', async () => {
      await http().get(`/equipment/${ids.mic}/upcoming-reservations`).set('Authorization', as('coordinator')).expect(403);
      await http().get('/equipment/EQP-999999/upcoming-reservations').set('Authorization', as('tech')).expect(404);
    });
  });

  describe('US-45 AC-8: simultaneous changes cannot exceed the limits', () => {
    // TC-S3-91 · US-45 AC-4 · setup: tc-s3-88 + tc-s3-88b · fails if two simultaneous marks can together exceed the working units
    // Code: EquipmentService.changeStatus (row lock FOR UPDATE)
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

    // TC-S3-91 · US-45 AC-4 · setup: tc-s3-88 + tc-s3-88b · fails if the same damaged units can be set back twice
    // Code: EquipmentService.changeStatus (row lock FOR UPDATE)
    it('US-45 AC-8: two simultaneous repairs of the same 3 damaged units — exactly one succeeds', async () => {
      await move(OPERATIONAL, OUT_OF_SERVICE, 3).expect(200);

      const results = await Promise.all([
        move(OUT_OF_SERVICE, OPERATIONAL, 3, 'first'),
        move(OUT_OF_SERVICE, OPERATIONAL, 3, 'second', 'tech2'),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await condition()).toMatchObject({ damagedQuantity: 0, workingQuantity: 10 });
    });

    // TC-S3-91, TC-S3-94 · US-45 AC-4, AC-7 · setup: tc-s3-88 + tc-s3-88b + tc-s3-92 · fails if a mark and a reservation together over-commit the working units silently
    // Code: EquipmentService.changeStatus and EquipmentReservationsService (same row lock)
    it('US-45 AC-8: a mark and a reservation at the same time never over-commit the working units', async () => {
      await given('tc-s3-92-setup');
      const event = await eventRow(ids.gala);

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

    // TC-S3-91 · US-45 AC-4 · setup: tc-s3-88 + tc-s3-88b · fails if the database accepts more damaged and under-maintenance units than the total
    // Code: Equipment_out_of_use_within_total CHECK
    it('US-45 AC-8: the database itself refuses counts over the total', async () => {
      await expect(
        prisma.equipment.update({ where: { id: ids.mic }, data: { damagedQuantity: 6, maintenanceQuantity: 5 } }),
      ).rejects.toThrow(/Equipment_out_of_use_within_total/);
    });
  });
});
