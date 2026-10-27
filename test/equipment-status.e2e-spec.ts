import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EquipmentStatus, PrismaClient, ReservationStatus, Role } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { nextReadableId } from '../src/prisma/readable-id';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-45 e2e — Technical Support marks equipment Damaged or Under Maintenance,
 * and back to Available. One describe per acceptance criterion, named
 * "US-45 AC-n" for traceability.
 *
 * Stored values: OPERATIONAL is "Available", OUT_OF_SERVICE is "Damaged"
 * (see EQUIPMENT_STATUS_LABELS).
 *
 * The status is per item, not per unit: the AC's "a quantity (e.g. 2 of 10)",
 * shortage counts and alternative suggestions are not built (code gaps,
 * docs/testing/sprint3-test-cases.md TC-S3-88 to 98).
 *
 * Pre-condition for every test: reset the testDB, then run base-users.sql and
 * tc-s3-88-setup.sql (the Wireless microphone EQP-016, and the "Conference"
 * EVT-213). Each test loads the tc-s3 scripts its test case names.
 */
describe('US-45 mark equipment damaged or under maintenance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  /** Fixed rows from base-users and tc-s3-88-setup. */
  const ids: Record<string, string> = {
    tech: 'USR-009',
    coordinator: 'USR-004',
    organiser: 'USR-006',
    venueStaff: 'USR-010',
    attendee: 'USR-001',
    mic: 'EQP-016',
  };
  const LOGINS: Record<string, string> = {
    tech: 'tech.support@example.com',
    coordinator: 'coord.a@example.com',
    organiser: 'organiser@example.com',
    venueStaff: 'venue.staff@example.com',
    attendee: 'attendee@example.com',
  };

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

  /** Loads a test case's setup script(s) on top of the base scripts. */
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  /** Events from tc-s3-88/93/93b-setup, by name. */
  const EVENTS: Record<string, string> = { Conference: 'EVT-213', Later: 'EVT-214', Sooner: 'EVT-215', Past: 'EVT-216' };
  const seedEvent = (name: string) => prisma.eventRequest.findUniqueOrThrow({ where: { id: EVENTS[name] } });

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
    await loadSql(prisma, 'base-users');
    for (const [key, email] of Object.entries(LOGINS)) {
      const res = await http().post('/auth/login').send({ email, password: PASSWORD }).expect(200);
      tokens[key] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await loadSql(prisma, 'base-users');
    await loadSql(prisma, 'tc-s3-88-setup');
  });

  describe('US-45 AC-1: change an item to Damaged or Under Maintenance', () => {
    // TC-S3-88 · US-45 AC-1 · setup: base-users + tc-s3-88-setup · fails if Technical Support cannot mark an item Damaged or Under Maintenance, or someone else can
    // Code: EquipmentService.changeStatus (PATCH /equipment/:id/status), @Roles(TECHNICAL_SUPPORT_STAFF)
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

    // TC-S3-88 · US-45 AC-1 · setup: base-users + tc-s3-88-setup · fails if Technical Support cannot mark an item Damaged or Under Maintenance, or someone else can
    // Code: EquipmentService.changeStatus (PATCH /equipment/:id/status), @Roles(TECHNICAL_SUPPORT_STAFF)
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

    // TC-S3-88 · US-45 AC-1 · setup: base-users + tc-s3-88-setup · fails if Technical Support cannot mark an item Damaged or Under Maintenance, or someone else can
    // Code: EquipmentService.changeStatus (PATCH /equipment/:id/status), @Roles(TECHNICAL_SUPPORT_STAFF)
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

    // TC-S3-88 · US-45 AC-1 · setup: base-users + tc-s3-88-setup · fails if Technical Support cannot mark an item Damaged or Under Maintenance, or someone else can
    // Code: EquipmentService.changeStatus (PATCH /equipment/:id/status), @Roles(TECHNICAL_SUPPORT_STAFF)
    it('409s when the item already has that status, and records nothing', async () => {
      const res = await changeStatus(ids.mic, {
        status: EquipmentStatus.OPERATIONAL,
        reason: 'No change.',
      }).expect(409);

      expect(res.body.message).toBe('this item is already Available');
      expect(await prisma.equipmentStatusChange.count()).toBe(0);
    });

    // TC-S3-88 · US-45 AC-1 · setup: base-users + tc-s3-88-setup · fails if Technical Support cannot mark an item Damaged or Under Maintenance, or someone else can
    // Code: EquipmentService.changeStatus (PATCH /equipment/:id/status), @Roles(TECHNICAL_SUPPORT_STAFF)
    it('400s for a status that does not exist', async () => {
      await changeStatus(ids.mic, { status: 'BROKEN', reason: 'Bad value.' }).expect(400);
    });

    // TC-S3-88 · US-45 AC-1 · setup: base-users + tc-s3-88-setup · fails if Technical Support cannot mark an item Damaged or Under Maintenance, or someone else can
    // Code: EquipmentService.changeStatus (PATCH /equipment/:id/status), @Roles(TECHNICAL_SUPPORT_STAFF)
    it('404s for an item that does not exist', async () => {
      await changeStatus('does-not-exist', {
        status: EquipmentStatus.OUT_OF_SERVICE,
        reason: 'Gone.',
      }).expect(404);
    });

    // TC-S3-88 · US-45 AC-1 · setup: base-users + tc-s3-88-setup · fails if Technical Support cannot mark an item Damaged or Under Maintenance, or someone else can
    // Code: EquipmentService.changeStatus (PATCH /equipment/:id/status), @Roles(TECHNICAL_SUPPORT_STAFF)
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

    // TC-S3-88 · US-45 AC-1 · setup: base-users + tc-s3-88-setup · fails if Technical Support cannot mark an item Damaged or Under Maintenance, or someone else can
    // Code: EquipmentService.changeStatus (PATCH /equipment/:id/status), @Roles(TECHNICAL_SUPPORT_STAFF)
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

    // TC-S3-88 · US-45 AC-1 · setup: base-users + tc-s3-88-setup · fails if Technical Support cannot mark an item Damaged or Under Maintenance, or someone else can
    // Code: EquipmentService.changeStatus (PATCH /equipment/:id/status), @Roles(TECHNICAL_SUPPORT_STAFF)
    it('is refused without a token', async () => {
      await http()
        .patch(`/equipment/${ids.mic}/status`)
        .send({ status: EquipmentStatus.OUT_OF_SERVICE, reason: 'Anonymous.' })
        .expect(401);
    });
  });

  describe('US-45 AC-2: a reason is required, and saved with the change', () => {
    // TC-S3-89 · US-45 AC-2 · setup: base-users + tc-s3-88-setup · fails if a status change saves without a reason, or the reason, who and when are not recorded
    // Code: ChangeEquipmentStatusDto (@Trim, @IsNotEmpty reason); EquipmentStatusChange
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

    // TC-S3-89 · US-45 AC-2 · setup: base-users + tc-s3-88-setup · fails if a status change saves without a reason, or the reason, who and when are not recorded
    // Code: ChangeEquipmentStatusDto (@Trim, @IsNotEmpty reason); EquipmentStatusChange
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

    // TC-S3-89 · US-45 AC-2 · setup: base-users + tc-s3-88-setup · fails if a status change saves without a reason, or the reason, who and when are not recorded
    // Code: ChangeEquipmentStatusDto (@Trim, @IsNotEmpty reason); EquipmentStatusChange
    it('gives every change its own readable ID, even when written at the same moment', async () => {
      // Concurrent writers share one counter; the database never hands out a
      // number twice (src/prisma/readable-id.ts).
      const issued = await Promise.all(
        Array.from({ length: 20 }, () => nextReadableId(prisma, 'EquipmentStatusChange')),
      );

      expect(new Set(issued).size).toBe(20);
      expect(issued.every((id) => /^ESC-\d{3,}$/.test(id))).toBe(true);
    });

    // TC-S3-89 · US-45 AC-2 · setup: base-users + tc-s3-88-setup · fails if a status change saves without a reason, or the reason, who and when are not recorded
    // Code: ChangeEquipmentStatusDto (@Trim, @IsNotEmpty reason); EquipmentStatusChange
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

    // TC-S3-89 · US-45 AC-2 · setup: base-users + tc-s3-88-setup · fails if a status change saves without a reason, or the reason, who and when are not recorded
    // Code: ChangeEquipmentStatusDto (@Trim, @IsNotEmpty reason); EquipmentStatusChange
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
        changedBy: { id: ids.tech, name: 'Toby Tech' },
      });
    });

    // TC-S3-89 · US-45 AC-2 · setup: base-users + tc-s3-88-setup · fails if a status change saves without a reason, or the reason, who and when are not recorded
    // Code: ChangeEquipmentStatusDto (@Trim, @IsNotEmpty reason); EquipmentStatusChange
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
    // TC-S3-90 · US-45 AC-3 · setup: base-users + tc-s3-88-setup · fails if a repaired item cannot be set back to Available
    // Code: EquipmentService.changeStatus -> OPERATIONAL
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

    // TC-S3-90 · US-45 AC-3 · setup: base-users + tc-s3-88-setup · fails if a repaired item cannot be set back to Available
    // Code: EquipmentService.changeStatus -> OPERATIONAL
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
    // TC-S3-92 · US-45 AC-5 · setup: base-users + tc-s3-88-setup · fails if a damaged or under-maintenance item is still counted available or can be reserved
    // Code: equipment-availability.ts, EquipmentReservationsService.commit
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

    // TC-S3-92 · US-45 AC-5 · setup: base-users + tc-s3-88-setup · fails if a damaged or under-maintenance item is still counted available or can be reserved
    // Code: equipment-availability.ts, EquipmentReservationsService.commit
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
    // TC-S3-93 · US-45 AC-6 · setup: base-users + tc-s3-88-setup + tc-s3-93-setup · fails if the warning leaves out an affected upcoming reservation, or includes one that is not affected
    // Code: EquipmentService upcoming reservations (affectedReservations, GET /equipment/:id/upcoming-reservations)
    it('lists live, upcoming reservations of the item, soonest first', async () => {
      await given('tc-s3-93-setup');
      const later = await seedEvent('Later');
      const sooner = await seedEvent('Sooner');
      const laterRes = { id: 'RSV-021' }; // 2, APPROVED, 1 Nov 2030
      const soonerRes = { id: 'RSV-022' }; // 3, REQUESTED, 1 Oct 2030

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
            coordinator: { id: ids.coordinator, name: 'Cody Coordinator' },
          },
        },
        expect.objectContaining({ id: laterRes.id, quantity: 2, status: 'APPROVED' }),
      ]);
    });

    // TC-S3-93 · US-45 AC-6 · setup: base-users + tc-s3-88-setup + tc-s3-93b-setup · fails if the warning leaves out an affected upcoming reservation, or includes one that is not affected
    // Code: EquipmentService upcoming reservations (affectedReservations, GET /equipment/:id/upcoming-reservations)
    it('leaves out reservations that are released, rejected, already over, or for another item', async () => {
      // Released, rejected, past, and another item's reservations (tc-s3-93b-setup).
      await given('tc-s3-93b-setup');

      const res = await changeStatus(ids.mic, {
        status: EquipmentStatus.UNDER_MAINTENANCE,
        reason: 'Service.',
      }).expect(200);

      expect(res.body.affectedReservations).toEqual([]);
    });

    // TC-S3-93 · US-45 AC-6 · setup: base-users + tc-s3-88-setup + tc-s3-93c-setup · fails if the warning leaves out an affected upcoming reservation, or includes one that is not affected
    // Code: EquipmentService upcoming reservations (affectedReservations, GET /equipment/:id/upcoming-reservations)
    it('lists nothing when an item is set back to Available', async () => {
      await given('tc-s3-93c-setup'); // 2 microphones APPROVED for the Conference

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

    // TC-S3-93, TC-S3-94 · US-45 AC-6/AC-7 · setup: base-users + tc-s3-88-setup + tc-s3-93c-setup · fails if the change cancels or alters an affected reservation
    // Code: EquipmentService upcoming reservations (affectedReservations, GET /equipment/:id/upcoming-reservations)
    it('warns without changing the reservations themselves', async () => {
      await given('tc-s3-93c-setup');
      const event = await seedEvent('Conference');
      const reservation = { id: 'RSV-027' }; // 2 microphones APPROVED

      await changeStatus(ids.mic, {
        status: EquipmentStatus.OUT_OF_SERVICE,
        reason: 'Faulty.',
      }).expect(200);

      const stored = await prisma.equipmentReservation.findUniqueOrThrow({
        where: { id: reservation.id },
      });
      expect(stored.status).toBe(ReservationStatus.APPROVED);
    });

    // TC-S3-93 · US-45 AC-6 · setup: base-users + tc-s3-88-setup + tc-s3-93c-setup · fails if the warning leaves out an affected upcoming reservation, or includes one that is not affected
    // Code: EquipmentService upcoming reservations (affectedReservations, GET /equipment/:id/upcoming-reservations)
    it('shows the same list before the change is saved, for the warning', async () => {
      await given('tc-s3-93c-setup');
      const event = await seedEvent('Conference');
      const reservation = { id: 'RSV-027' }; // 2 microphones APPROVED

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

    // TC-S3-93 · US-45 AC-6 · setup: base-users + tc-s3-88-setup · fails if the warning leaves out an affected upcoming reservation, or includes one that is not affected
    // Code: EquipmentService upcoming reservations (affectedReservations, GET /equipment/:id/upcoming-reservations)
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
