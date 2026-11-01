import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  EquipmentStatus,
  EquipmentSuggestionStatus,
  EventStatus,
  NotificationType,
  PrismaClient,
  ReservationStatus,
} from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

const { OPERATIONAL, OUT_OF_SERVICE } = EquipmentStatus;

/**
 * US-45 e2e (reopened) — when damaged or under-maintenance units leave too few
 * working units for the upcoming reservations:
 *
 *   AC-5 each affected reservation is flagged "Short by N" on the event page
 *        (Coordinator and Organiser) and on Technical Support's screens, and
 *        the flag clears by itself once the reservations fit again
 *   AC-6 Technical Support reduce or release a reservation, with a reason;
 *        recorded in the event's history; the Coordinator is told
 *   AC-7 for a confirmed event, Technical Support suggest an alternative item;
 *        the Coordinator accepts (one step: reserve it, reduce or release the
 *        short one) or declines; one open suggestion per reservation; it
 *        becomes invalid if the alternative is gone when accepted
 *
 * Nothing is decided automatically.
 *
 * The names above follow the reopened story's numbering. The written test
 * cases (TC-S3-94 to 98, and Story 67's TC-S4-110) follow the cards' own
 * numbering; each test's tag names both.
 *
 * Pre-condition for every test: reset the testDB, then run tc-s3-88-setup.sql
 * (the users) and tc-s3-94-setup.sql (Projector x10, Laser projector x4,
 * Screen x1; "Gala" and "Fair", confirmed, 5 projectors each at the same time).
 */
describe('US-45 resolving an equipment shortage (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  /** Fixed rows from tc-s3-88-setup and tc-s3-94-setup. */
  const ids: Record<string, string> = {
    tech: 'USR-046',
    tech2: 'USR-047',
    coordinator: 'USR-048',
    otherCoordinator: 'USR-050',
    organiser: 'USR-051',
    projector: 'EQP-034',
    laser: 'EQP-035',
    screen: 'EQP-036',
    gala: 'EVT-322',
    fair: 'EVT-323',
    galaRes: 'RSV-052',
    fairRes: 'RSV-053',
  };
  const LOGINS: Record<string, string> = {
    tech: 'tech@example.com',
    tech2: 'tech2@example.com',
    coordinator: 'coordinator@example.com',
    otherCoordinator: 'other@example.com',
    organiser: 'organiser@example.com',
  };

  const START = '2030-10-01T09:00:00.000Z';
  const END = '2030-10-01T17:00:00.000Z';

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  const markDamaged = (quantity: number, equipmentId = ids.projector) =>
    http()
      .patch(`/equipment/${equipmentId}/status`)
      .set('Authorization', as('tech'))
      .send({ from: OPERATIONAL, to: OUT_OF_SERVICE, quantity, reason: 'Cracked lens' });

  const repair = (quantity: number) =>
    http()
      .patch(`/equipment/${ids.projector}/status`)
      .set('Authorization', as('tech'))
      .send({ from: OUT_OF_SERVICE, to: OPERATIONAL, quantity, reason: 'Repaired' });

  const reduce = (reservationId: string, body: Record<string, unknown>, who = 'tech') =>
    http().patch(`/equipment/reservations/${reservationId}`).set('Authorization', as(who)).send(body);

  const release = (reservationId: string, body: Record<string, unknown>, who = 'tech') =>
    http().post(`/equipment/reservations/${reservationId}/release`).set('Authorization', as(who)).send(body);

  const suggest = (reservationId: string, body: Record<string, unknown>, who = 'tech') =>
    http().post(`/equipment/reservations/${reservationId}/suggestions`).set('Authorization', as(who)).send(body);

  const accept = (suggestionId: string, who = 'coordinator') =>
    http().post(`/equipment/suggestions/${suggestionId}/accept`).set('Authorization', as(who));

  const noAlternative = (reservationId: string, body: Record<string, unknown>, who = 'tech') =>
    http().post(`/equipment/reservations/${reservationId}/no-alternative`).set('Authorization', as(who)).send(body);

  const decline = (suggestionId: string, who = 'coordinator') =>
    http().post(`/equipment/suggestions/${suggestionId}/decline`).set('Authorization', as(who));

  const coordinatorView = async (eventId: string) =>
    (await http().get(`/events/assigned/${eventId}`).set('Authorization', as('coordinator')).expect(200)).body;

  const techView = async (eventId: string) =>
    (await http().get(`/equipment/events/${eventId}/reservations`).set('Authorization', as('tech')).expect(200)).body;

  const reservation = (id: string) => prisma.equipmentReservation.findUniqueOrThrow({ where: { id } });

  const notices = (who: string, type: NotificationType) =>
    prisma.notification.findMany({ where: { recipientId: ids[who], type } });

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
    for (const [who, email] of Object.entries(LOGINS)) {
      const res = await http().post('/auth/login').send({ email, password: PASSWORD }).expect(200);
      tokens[who] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    // Two confirmed events holding 5 projectors each at the same time.
    await given('tc-s3-88-setup', 'tc-s3-94-setup');
  });

  describe('US-45 AC-5: affected reservations are flagged "Short by N"', () => {
    // TC-S3-94 · US-45 AC-7 · setup: tc-s3-88 + tc-s3-94 · fails if a short reservation is not flagged on the Coordinator's event page with how many short
    // Code: EquipmentShortageService.findEventReservations (shortBy); events view
    it('US-45 AC-5: on the Coordinator\'s event page, with how many short', async () => {
      await markDamaged(3).expect(200);

      const view = await coordinatorView(ids.gala);

      expect(view.equipmentShortages).toEqual([
        expect.objectContaining({ reservationId: ids.galaRes, equipmentType: 'Projector', quantity: 5, shortBy: 3 }),
      ]);
    });

    // TC-S3-94 · US-45 AC-7 · setup: tc-s3-88 + tc-s3-94 · fails if the Organiser's event page does not flag the shortage
    // Code: EquipmentShortageService.findEventReservations; organiser view
    it("US-45 AC-5: on the Organiser's event page too", async () => {
      await markDamaged(3).expect(200);

      const view = (await http().get(`/events/mine/${ids.gala}`).set('Authorization', as('organiser')).expect(200)).body;

      expect(view.equipmentShortages).toEqual([expect.objectContaining({ reservationId: ids.galaRes, shortBy: 3 })]);
    });

    // TC-S3-94 · US-45 AC-7 · setup: tc-s3-88 + tc-s3-94 · fails if Technical Support's screens do not show how many short
    // Code: EquipmentShortageActionsService.listForEvent; EquipmentService.findUpcomingReservations
    it("US-45 AC-5: on Technical Support's event and item screens", async () => {
      await markDamaged(3).expect(200);

      expect(await techView(ids.gala)).toEqual([expect.objectContaining({ reservationId: ids.galaRes, shortBy: 3 })]);
      const item = (
        await http().get(`/equipment/${ids.projector}/upcoming-reservations`).set('Authorization', as('tech')).expect(200)
      ).body;
      expect(item.map((r: { id: string; shortBy: number }) => [r.id, r.shortBy]).sort()).toEqual(
        [
          [ids.galaRes, 3],
          [ids.fairRes, 3],
        ].sort(),
      );
    });

    // TC-S3-94 · US-45 AC-7 · setup: tc-s3-88 + tc-s3-94 · fails if Technical Support's event screen does not 404 for an unknown event
    // Code: EquipmentShortageActionsService.listForEvent (404)
    it("US-45 AC-5: Technical Support's event screen 404s for an unknown event", async () => {
      await http().get('/equipment/events/EVT-999999/reservations').set('Authorization', as('tech')).expect(404);
    });

    // TC-S3-94 · US-45 AC-7 · setup: tc-s3-88 + tc-s3-94 · fails if a reservation is flagged while the working units cover it
    // Code: computeShortages (none short)
    it('US-45 AC-5: nothing is flagged while the working units cover every reservation', async () => {
      // 10 working for 5 + 5 reserved.
      expect((await coordinatorView(ids.gala)).equipmentShortages).toEqual([]);
      expect(await techView(ids.gala)).toEqual([expect.objectContaining({ shortBy: 0 })]);
    });

    // TC-S3-94 · US-45 AC-7 · setup: tc-s3-88 + tc-s3-94 · fails if the flag stays after the units are repaired
    // Code: loadShortages (computed on read, never stored)
    it('US-45 AC-5: the flag clears by itself after a repair', async () => {
      await markDamaged(3).expect(200);
      await repair(3).expect(200);

      expect((await coordinatorView(ids.gala)).equipmentShortages).toEqual([]);
    });

    // TC-S3-94 · US-45 AC-7 · setup: tc-s3-88 + tc-s3-94 · fails if the flag stays after a reservation is reduced to fit
    // Code: loadShortages (computed on read)
    it('US-45 AC-5: the flag clears by itself once a reservation is reduced to fit', async () => {
      await markDamaged(3).expect(200);
      await reduce(ids.fairRes, { quantity: 2, reason: 'Fair can manage with 2' }).expect(200);

      expect((await coordinatorView(ids.gala)).equipmentShortages).toEqual([]);
      expect((await coordinatorView(ids.fair)).equipmentShortages).toEqual([]);
    });

    // TC-S3-94 · US-45 AC-7 · setup: tc-s3-88 + tc-s3-94 + tc-s3-94b · fails if a finished event's reservation is flagged
    // Code: upcomingReservationsWhere (end > now)
    it('US-45 AC-5: a reservation already over is never flagged', async () => {
      await given('tc-s3-94b-setup');
      const past = 'EVT-324';

      await markDamaged(10).expect(200);

      expect((await coordinatorView(past)).equipmentShortages).toEqual([]);
    });
  });

  describe('US-45 AC-6: Technical Support reduce or release a reservation, with a reason', () => {
    beforeEach(async () => {
      await markDamaged(3).expect(200);
      // Kept by design: clears the status change's notices, so each test counts only its own.
      await prisma.notification.deleteMany();
    });

    // TC-S3-98 · US-45 AC-11 · setup: tc-s3-88 + tc-s3-94 · fails if a reservation can be reduced without a reason
    // Code: ReduceReservationDto (reason required)
    it.each([undefined, '', '   '])('US-45 AC-6: reducing needs a reason (%p)', async (reason) => {
      await reduce(ids.galaRes, { quantity: 2, reason }).expect(400);
      expect(await reservation(ids.galaRes)).toMatchObject({ quantity: 5 });
    });

    // TC-S3-98 · US-45 AC-11 · setup: tc-s3-88 + tc-s3-94 · fails if a reason that is not text is accepted
    // Code: ReduceReservationDto (reason: @IsString after the trim)
    it('US-45 AC-6: a reason that is not text is refused', async () => {
      await reduce(ids.galaRes, { quantity: 2, reason: 42 }).expect(400);
      expect(await reservation(ids.galaRes)).toMatchObject({ quantity: 5 });
    });

    // TC-S3-98 · US-45 AC-11 · setup: tc-s3-88 + tc-s3-94 · fails if reducing does not free the units, or misses the history entry or the Coordinator's notice
    // Code: EquipmentShortageActionsService.reduce; EquipmentNotifier.reservationAdjusted
    it('US-45 AC-6: reduce to fewer units — availability, history and the Coordinator all follow', async () => {
      const res = await reduce(ids.galaRes, { quantity: 2, reason: '  Gala can use the screen instead  ' }).expect(200);

      expect(res.body).toEqual({ reservationId: ids.galaRes, quantity: 2, status: ReservationStatus.APPROVED });
      expect(await reservation(ids.galaRes)).toMatchObject({ quantity: 2, status: ReservationStatus.APPROVED });

      // 7 working: 2 + 5 = 7 reserved, so none is free and none is short.
      const free = await http()
        .get(`/equipment/${ids.projector}/availability`)
        .query({ start: START, end: END, quantity: 1 })
        .set('Authorization', as('tech'))
        .expect(200);
      expect(free.body).toMatchObject({ reservedQuantity: 7, availableQuantity: 0 });

      const [entry] = await prisma.eventChange.findMany({ where: { eventId: ids.gala } });
      expect(entry).toMatchObject({ changedById: ids.tech });
      expect(entry.changes).toEqual([
        { field: 'equipmentReservations', previous: ['5 × Projector'], next: ['2 × Projector'] },
        { field: 'equipmentReservationReason', previous: null, next: 'Gala can use the screen instead' },
      ]);

      const [notice] = await notices('coordinator', NotificationType.EQUIPMENT_RESERVATION_ADJUSTED);
      expect(notice).toMatchObject({
        relatedEventId: ids.gala,
        message:
          'Technical Support reduced Projector for your event "Gala" from 5 to 2. ' +
          'Reason: Gala can use the screen instead',
      });
    });

    // TC-S3-98 · US-45 AC-11 · setup: tc-s3-88 + tc-s3-94 · fails if a reservation can be "reduced" to as many or more units
    // Code: EquipmentShortageActionsService.reduce (quantity < reserved)
    it('US-45 AC-6: reducing to the same or more units is refused — release it instead', async () => {
      const res = await reduce(ids.galaRes, { quantity: 5, reason: 'x' }).expect(400);
      expect(res.body.message).toEqual([
        'quantity must be fewer than the 5 reserved; to give them all back, release the reservation',
      ]);
    });

    // TC-S3-98 · US-45 AC-11 · setup: tc-s3-88 + tc-s3-94 · fails if a reservation can be released without a reason
    // Code: ReleaseReservationDto (reason required)
    it.each([undefined, '   '])('US-45 AC-6: releasing needs a reason (%p)', async (reason) => {
      await release(ids.galaRes, { reason }).expect(400);
      expect(await reservation(ids.galaRes)).toMatchObject({ status: ReservationStatus.APPROVED });
    });

    // TC-S3-98 · US-45 AC-11 · setup: tc-s3-88 + tc-s3-94 · fails if releasing does not free the units, deletes the record, or misses the history or the notice
    // Code: EquipmentShortageActionsService.release
    it('US-45 AC-6: release — the units are freed, the record is kept, history and the Coordinator follow', async () => {
      const res = await release(ids.galaRes, { reason: 'Gala moved to the laser projectors' }).expect(200);

      expect(res.body).toEqual({ reservationId: ids.galaRes, quantity: 0, status: ReservationStatus.RELEASED });
      expect(await reservation(ids.galaRes)).toMatchObject({ status: ReservationStatus.RELEASED, quantity: 5 });
      expect((await reservation(ids.galaRes)).releasedAt).not.toBeNull();

      const free = await http()
        .get(`/equipment/${ids.projector}/availability`)
        .query({ start: START, end: END, quantity: 1 })
        .set('Authorization', as('tech'))
        .expect(200);
      expect(free.body).toMatchObject({ reservedQuantity: 5, availableQuantity: 2 });

      const [entry] = await prisma.eventChange.findMany({ where: { eventId: ids.gala } });
      expect(entry.changes).toEqual([
        { field: 'equipmentReservations', previous: ['5 × Projector'], next: ['Projector: released'] },
        { field: 'equipmentReservationReason', previous: null, next: 'Gala moved to the laser projectors' },
      ]);
      expect(await notices('coordinator', NotificationType.EQUIPMENT_RESERVATION_ADJUSTED)).toEqual([
        expect.objectContaining({
          message:
            'Technical Support released the 5 × Projector reserved for your event "Gala". ' +
            'Reason: Gala moved to the laser projectors',
        }),
      ]);
    });

    // TC-S3-98 · US-45 AC-11 · setup: tc-s3-88 + tc-s3-94 · fails if a released reservation can be reduced or released again
    // Code: EquipmentShortageActionsService (APPROVED only, 409)
    it('US-45 AC-6: a released reservation cannot be adjusted again', async () => {
      await release(ids.galaRes, { reason: 'x' }).expect(200);
      await reduce(ids.galaRes, { quantity: 1, reason: 'x' }).expect(409);
      await release(ids.galaRes, { reason: 'x' }).expect(409);
    });

    // TC-S3-98 · US-45 AC-11 · setup: tc-s3-88 + tc-s3-94 + tc-s3-98b · fails if a finished reservation can be adjusted
    // Code: EquipmentShortageActionsService (upcoming only, 409)
    it('US-45 AC-6: a reservation already over cannot be adjusted', async () => {
      await given('tc-s3-98b-setup');
      const pastRes = 'RSV-055';

      await reduce(pastRes, { quantity: 1, reason: 'x' }).expect(409);
    });

    // TC-S3-98 · US-45 AC-11 · setup: tc-s3-88 + tc-s3-94 · fails if another role can reduce or release
    // Code: EquipmentShortageController (@Roles TECHNICAL_SUPPORT_STAFF)
    it.each(['coordinator', 'organiser'])('US-45 AC-6: only Technical Support may adjust (%s is refused)', async (who) => {
      await reduce(ids.galaRes, { quantity: 2, reason: 'x' }, who).expect(403);
      await release(ids.galaRes, { reason: 'x' }, who).expect(403);
      expect(await reservation(ids.galaRes)).toMatchObject({ quantity: 5, status: ReservationStatus.APPROVED });
    });

    // TC-S3-98 · US-45 AC-11 · setup: tc-s3-88 + tc-s3-94 · fails if an unknown reservation does not 404
    // Code: EquipmentShortageActionsService.reduce (404)
    it('US-45 AC-6: 404s for a reservation that does not exist', async () => {
      await reduce('RSV-999999', { quantity: 1, reason: 'x' }).expect(404);
    });
  });

  describe('US-45 AC-7: an alternative item for a confirmed event', () => {
    beforeEach(async () => {
      // 7 projectors work for 10 reserved: Gala and Fair are each short by 3.
      await markDamaged(3).expect(200);
      // Kept by design: clears the status change's notices, so each test counts only its own.
      await prisma.notification.deleteMany();
    });

    const suggestLaser = (quantity = 3, reservationId = ids.galaRes) =>
      suggest(reservationId, { alternativeEquipmentId: ids.laser, quantity, reason: 'Same brightness' });

    // TC-S3-95 · US-45 AC-8 · setup: tc-s3-88 + tc-s3-94 · fails if the list offers an item not free in the needed quantity, or the short item itself
    // Code: EquipmentShortageActionsService.alternatives
    it('US-45 AC-7: offers only other items free in the needed quantity', async () => {
      const res = await http()
        .get(`/equipment/reservations/${ids.galaRes}/alternatives`)
        .query({ quantity: 3 })
        .set('Authorization', as('tech'))
        .expect(200);

      // Laser has 4 free; Screen has only 1; Projector is the short item itself.
      expect(res.body).toEqual([{ equipmentId: ids.laser, type: 'Laser projector', location: null, availableQuantity: 4 }]);
    });

    // TC-S3-95 · US-45 AC-8 · setup: tc-s3-88 + tc-s3-94 + tc-s3-97 · fails if an item another event holds part of is offered for more than it has free
    // Code: EquipmentShortageActionsService.alternatives (other items' reservations in the window)
    it('US-45 AC-7: counts what other events hold of an item, offering it only up to its free units', async () => {
      // Fair holds 2 of the 4 laser projectors at the same time.
      await given('tc-s3-97-setup');
      const list = (quantity: number) =>
        http()
          .get(`/equipment/reservations/${ids.galaRes}/alternatives`)
          .query({ quantity })
          .set('Authorization', as('tech'))
          .expect(200);

      expect((await list(3)).body).toEqual([]);
      expect((await list(2)).body).toEqual([{ equipmentId: ids.laser, type: 'Laser projector', location: null, availableQuantity: 2 }]);
    });

    // TC-S3-95 · US-45 AC-8 · setup: tc-s3-88 + tc-s3-94 · fails if the alternatives of an unknown reservation do not 404
    // Code: EquipmentShortageActionsService.alternatives (404)
    it('US-45 AC-7: 404s for the alternatives of an unknown reservation', async () => {
      await http()
        .get('/equipment/reservations/RSV-999999/alternatives')
        .query({ quantity: 1 })
        .set('Authorization', as('tech'))
        .expect(404);
    });

    // TC-S3-95 · US-45 AC-8 · setup: tc-s3-88 + tc-s3-94 · fails if a suggestion can be made without a reason
    // Code: SuggestAlternativeDto (reason required)
    it('US-45 AC-7: suggesting needs a reason', async () => {
      await suggest(ids.galaRes, { alternativeEquipmentId: ids.laser, quantity: 3, reason: ' ' }).expect(400);
      expect(await prisma.equipmentSuggestion.count()).toBe(0);
    });

    // TC-S3-95, TC-S4-110 · US-45 AC-8, US-67 AC-4 · setup: tc-s3-88 + tc-s3-94 · fails if a suggestion is not recorded with a readable ID, or the Coordinator is not told
    // Code: EquipmentShortageActionsService.suggest; EquipmentNotifier.alternativeSuggested
    it('US-45 AC-7: a suggestion is recorded, readable ID and all, and the Coordinator is told', async () => {
      const res = await suggestLaser().expect(201);

      expect(res.body).toMatchObject({ quantity: 3, status: EquipmentSuggestionStatus.OPEN, suggestedById: ids.tech });
      expect(res.body.id).toMatch(/^ESG-\d{3,}$/);
      expect(await notices('coordinator', NotificationType.EQUIPMENT_ALTERNATIVE_SUGGESTED)).toEqual([
        expect.objectContaining({
          relatedEventId: ids.gala,
          message:
            'Technical Support suggest 3 × Laser projector in place of 3 × Projector for your event "Gala". ' +
            'Reason: Same brightness',
        }),
      ]);
    });

    // TC-S3-96, TC-S4-110 · US-45 AC-9, US-67 AC-4 · setup: tc-s3-88 + tc-s3-94 · fails if the Coordinator does not see the suggestion and its reason, or the Organiser does
    // Code: latestAnswer; events view (Coordinator only)
    it('US-45 AC-7: the Coordinator sees it on the event page; the Organiser does not', async () => {
      await suggestLaser().expect(201);

      const [short] = (await coordinatorView(ids.gala)).equipmentShortages;
      expect(short.openSuggestion).toMatchObject({
        quantity: 3,
        reason: 'Same brightness',
        alternativeEquipment: { id: ids.laser, type: 'Laser projector' },
      });

      const organiser = (await http().get(`/events/mine/${ids.gala}`).set('Authorization', as('organiser')).expect(200)).body;
      expect(organiser.equipmentShortages[0].openSuggestion).toBeNull();
    });

    // TC-S3-95 · US-45 AC-8 · setup: tc-s3-88 + tc-s3-94 · fails if an item not free in that quantity for the event's time can be suggested
    // Code: EquipmentShortageActionsService.suggest (availability for the window)
    it('US-45 AC-7: only from items available in that quantity for the event\'s time', async () => {
      const res = await suggest(ids.galaRes, { alternativeEquipmentId: ids.screen, quantity: 3, reason: 'x' }).expect(409);
      expect(res.body.message).toBe("only 1 Screen are free for the event's date and time");
    });

    // TC-S3-95 · US-45 AC-8 · setup: tc-s3-88 + tc-s3-94 · fails if the short item can be suggested as its own alternative
    // Code: EquipmentShortageActionsService.suggest (400)
    it('US-45 AC-7: never the short item itself', async () => {
      await suggest(ids.galaRes, { alternativeEquipmentId: ids.projector, quantity: 3, reason: 'x' }).expect(400);
    });

    // TC-S3-95 · US-45 AC-8 · setup: tc-s3-88 + tc-s3-94 · fails if more units than are reserved can be suggested
    // Code: EquipmentShortageActionsService.suggest (quantity <= reserved)
    it('US-45 AC-7: never more units than the reservation holds', async () => {
      const res = await suggest(ids.galaRes, { alternativeEquipmentId: ids.laser, quantity: 6, reason: 'x' }).expect(400);
      expect(res.body.message).toEqual(['quantity must be at most the 5 reserved']);
      expect(await prisma.equipmentSuggestion.count()).toBe(0);
    });

    // TC-S3-95, TC-S4-110 · US-45 AC-8, US-67 AC-4 · setup: tc-s3-88 + tc-s3-94 · fails if an alternative can be suggested before the event is confirmed
    // Code: EquipmentShortageActionsService.suggest (CONFIRMED only)
    it('US-45 AC-7: only for a confirmed event', async () => {
      // Kept by design: takes the event back into planning after the shortage arose.
      await prisma.eventRequest.update({ where: { id: ids.gala }, data: { status: EventStatus.PLANNING } });
      const res = await suggestLaser().expect(409);
      expect(res.body.message).toMatch(/only for a confirmed event/);
    });

    // TC-S3-95 · US-45 AC-8 · setup: tc-s3-88 + tc-s3-94 · fails if an alternative can be suggested for a reservation that is not short
    // Code: EquipmentShortageActionsService.suggest (shortBy > 0)
    it('US-45 AC-7: only for a reservation that is short', async () => {
      await repair(3).expect(200);
      await suggestLaser().expect(409);
    });

    // TC-S3-95 · US-45 AC-8 · setup: tc-s3-88 + tc-s3-94 · fails if two suggestions can be open at once, or none can follow a decided one
    // Code: EquipmentShortageActionsService.suggest (one OPEN per reservation)
    it('US-45 AC-7: only one open suggestion per short reservation at a time', async () => {
      await suggestLaser(2).expect(201);
      const second = await suggestLaser(3).expect(409);
      expect(second.body.message).toMatch(/already has an open suggestion/);

      // Once decided, another may be made.
      const [open] = await prisma.equipmentSuggestion.findMany();
      await decline(open.id).expect(200);
      await suggestLaser(3).expect(201);
    });

    // TC-S3-95 · US-45 AC-8 · setup: tc-s3-88 + tc-s3-94 · fails if the database stores two open suggestions for one reservation
    // Code: EquipmentSuggestion partial unique index (OPEN)
    it('US-45 AC-7: the database itself allows only one open suggestion per reservation', async () => {
      await suggestLaser().expect(201);
      await expect(
        prisma.equipmentSuggestion.create({
          data: {
            reservationId: ids.galaRes,
            alternativeEquipmentId: ids.laser,
            quantity: 1,
            reason: 'x',
            suggestedById: ids.tech,
          },
        }),
      ).rejects.toThrow();
    });

    // TC-S3-97, TC-S4-110 · US-45 AC-10, US-67 AC-4 · setup: tc-s3-88 + tc-s3-94 · fails if accepting does not reserve the alternative and reduce the short reservation in one step
    // Code: EquipmentShortageActionsService.accept
    it('US-45 AC-7: accepting reserves the alternative and reduces the short reservation, in one step', async () => {
      const { body: suggestion } = await suggestLaser(3).expect(201);

      const res = await accept(suggestion.id).expect(200);

      expect(res.body).toMatchObject({ status: 'ACCEPTED', remainingQuantity: 2 });
      expect(await reservation(ids.galaRes)).toMatchObject({ quantity: 2, status: ReservationStatus.APPROVED });
      expect(await reservation(res.body.replacementReservationId)).toMatchObject({
        eventId: ids.gala,
        equipmentId: ids.laser,
        quantity: 3,
        status: ReservationStatus.APPROVED,
        start: new Date(START),
        end: new Date(END),
      });
      expect(await prisma.equipmentSuggestion.findUniqueOrThrow({ where: { id: suggestion.id } })).toMatchObject({
        status: EquipmentSuggestionStatus.ACCEPTED,
        decidedById: ids.coordinator,
      });
      // 2 + 5 = 7 projectors on 7 working: Gala is no longer short.
      expect((await coordinatorView(ids.gala)).equipmentShortages).toEqual([]);
    });

    // TC-S3-97, TC-S4-110 · US-45 AC-10, US-67 AC-4 · setup: tc-s3-88 + tc-s3-94 · fails if accepting misses the history entry, or Technical Support are not told
    // Code: EquipmentShortageActionsService.accept (EventsService.recordChange; toTechnicalSupport)
    it('US-45 AC-7: accepting records the change in the history and tells Technical Support', async () => {
      const { body: suggestion } = await suggestLaser(3).expect(201);
      await accept(suggestion.id).expect(200);

      const [entry] = await prisma.eventChange.findMany({ where: { eventId: ids.gala } });
      expect(entry).toMatchObject({ changedById: ids.coordinator });
      expect(entry.changes).toEqual([
        { field: 'equipmentReservations', previous: ['5 × Projector'], next: ['2 × Projector', '3 × Laser projector'] },
        { field: 'equipmentReservationReason', previous: null, next: 'Alternative accepted: Same brightness' },
      ]);

      // The member who suggested it, and the event's assigned member.
      for (const who of ['tech', 'tech2']) {
        expect(await notices(who, NotificationType.EQUIPMENT_ALTERNATIVE_DECIDED)).toEqual([
          expect.objectContaining({
            message:
              'The Coordinator accepted 3 × Laser projector in place of 3 × Projector for "Gala"; it is reserved.',
          }),
        ]);
      }
    });

    // TC-S3-97 · US-45 AC-10 · setup: tc-s3-88 + tc-s3-94 · fails if accepting for every unit leaves the short reservation held
    // Code: EquipmentShortageActionsService.accept (remaining 0 -> RELEASED)
    it('US-45 AC-7: accepting a suggestion for every unit releases the short reservation', async () => {
      // Gala down to 4 first: 4 + 5 on 7 working, so it is still short by 2.
      await reduce(ids.galaRes, { quantity: 4, reason: 'Trim' }).expect(200);
      const { body: suggestion } = await suggestLaser(4).expect(201);

      const res = await accept(suggestion.id).expect(200);

      expect(res.body).toMatchObject({ remainingQuantity: 0 });
      expect(await reservation(ids.galaRes)).toMatchObject({ status: ReservationStatus.RELEASED, quantity: 4 });
      const [, entry] = await prisma.eventChange.findMany({ where: { eventId: ids.gala }, orderBy: { createdAt: 'asc' } });
      expect(entry.changes).toEqual([
        { field: 'equipmentReservations', previous: ['4 × Projector'], next: ['4 × Laser projector'] },
        { field: 'equipmentReservationReason', previous: null, next: 'Alternative accepted: Same brightness' },
      ]);
    });

    // TC-S3-97, TC-S4-110 · US-45 AC-10, US-67 AC-4 · setup: tc-s3-88 + tc-s3-94 · fails if declining changes the reservation, reserves the alternative, records history, or Technical Support are not told
    // Code: EquipmentShortageActionsService.decline
    it('US-45 AC-7: declining keeps the original reservation unchanged, and tells Technical Support', async () => {
      const { body: suggestion } = await suggestLaser().expect(201);

      await decline(suggestion.id).expect(200);

      expect(await reservation(ids.galaRes)).toMatchObject({ quantity: 5, status: ReservationStatus.APPROVED });
      expect(await prisma.equipmentReservation.count({ where: { equipmentId: ids.laser } })).toBe(0);
      expect(await prisma.equipmentSuggestion.findUniqueOrThrow({ where: { id: suggestion.id } })).toMatchObject({
        status: EquipmentSuggestionStatus.DECLINED,
      });
      expect(await notices('tech', NotificationType.EQUIPMENT_ALTERNATIVE_DECIDED)).toEqual([
        expect.objectContaining({ message: expect.stringContaining('declined') }),
      ]);
      expect(await prisma.eventChange.count({ where: { eventId: ids.gala } })).toBe(0);
    });

    // TC-S3-97, TC-S4-110 · US-45 AC-10, US-67 AC-4 · setup: tc-s3-88 + tc-s3-94 + tc-s3-97 · fails if a suggestion can be accepted after the alternative stopped being free
    // Code: EquipmentShortageActionsService.accept (re-check -> INVALID)
    it('US-45 AC-7: becomes invalid if the alternative is no longer available when accepted', async () => {
      const { body: suggestion } = await suggestLaser(3).expect(201);
      // Meanwhile 2 of the 4 laser projectors go to another event.
      await given('tc-s3-97-setup');

      const res = await accept(suggestion.id).expect(409);

      expect(res.body.message).toBe('This suggestion is no longer valid: only 2 Laser projector are free now.');
      expect(await prisma.equipmentSuggestion.findUniqueOrThrow({ where: { id: suggestion.id } })).toMatchObject({
        status: EquipmentSuggestionStatus.INVALID,
      });
      expect(await reservation(ids.galaRes)).toMatchObject({ quantity: 5 });
      expect(await prisma.equipmentReservation.count({ where: { eventId: ids.gala, equipmentId: ids.laser } })).toBe(0);
    });

    // TC-S3-96, TC-S4-110 · US-45 AC-9, US-67 AC-4 · setup: tc-s3-88 + tc-s3-94 · fails if a decided suggestion can be decided again
    // Code: EquipmentShortageActionsService (OPEN only, 409)
    it('US-45 AC-7: a suggestion cannot be decided twice', async () => {
      const { body: suggestion } = await suggestLaser().expect(201);
      await decline(suggestion.id).expect(200);
      await accept(suggestion.id).expect(409);
      await decline(suggestion.id).expect(409);
    });

    // TC-S3-97 · US-45 AC-10 · setup: tc-s3-88 + tc-s3-94 · fails if an accept and a decline at once can both win
    // Code: EquipmentShortageActionsService (row lock on the suggestion)
    it('US-45 AC-7: a simultaneous accept and decline — exactly one wins', async () => {
      const { body: suggestion } = await suggestLaser().expect(201);

      const results = await Promise.all([accept(suggestion.id), decline(suggestion.id)]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const laserReserved = await prisma.equipmentReservation.count({ where: { equipmentId: ids.laser } });
      const final = await prisma.equipmentSuggestion.findUniqueOrThrow({ where: { id: suggestion.id } });
      expect(laserReserved).toBe(final.status === EquipmentSuggestionStatus.ACCEPTED ? 1 : 0);
    });

    // TC-S3-96, TC-S4-110 · US-45 AC-9, US-67 AC-4 · setup: tc-s3-88 + tc-s3-94 · fails if another Coordinator or Technical Support can decide
    // Code: EquipmentShortageActionsService.accept / decline (own event, 404; @Roles)
    it("US-45 AC-7: only the event's own Coordinator decides; Technical Support cannot", async () => {
      const { body: suggestion } = await suggestLaser().expect(201);

      await accept(suggestion.id, 'otherCoordinator').expect(404);
      await decline(suggestion.id, 'otherCoordinator').expect(404);
      await accept(suggestion.id, 'tech').expect(403);
      expect(await prisma.equipmentSuggestion.findUniqueOrThrow({ where: { id: suggestion.id } })).toMatchObject({
        status: EquipmentSuggestionStatus.OPEN,
      });
    });

    // TC-S3-97 · US-45 AC-10 · setup: tc-s3-88 + tc-s3-94 · fails if a suggestion stays open after its reservation is released
    // Code: EquipmentShortageActionsService.release (open suggestion -> INVALID)
    it('US-45 AC-7: releasing the short reservation closes its open suggestion', async () => {
      const { body: suggestion } = await suggestLaser().expect(201);

      await release(ids.galaRes, { reason: 'Not needed' }).expect(200);

      expect(await prisma.equipmentSuggestion.findUniqueOrThrow({ where: { id: suggestion.id } })).toMatchObject({
        status: EquipmentSuggestionStatus.INVALID,
      });
      await accept(suggestion.id).expect(409);
    });

    // TC-S3-97, TC-S4-110 · US-45 AC-10, US-67 AC-4 · setup: tc-s3-88 + tc-s3-94 · fails if a suggestion can still be accepted after the event was cancelled and its equipment released
    // Code: EquipmentShortageActionsService.accept (short reservation no longer holds units -> INVALID)
    it('US-45 AC-7: becomes invalid if the event is cancelled before the Coordinator decides', async () => {
      const { body: suggestion } = await suggestLaser().expect(201);
      await http()
        .post(`/events/${ids.gala}/cancel`)
        .set('Authorization', as('organiser'))
        .send({ reason: 'Speaker withdrew', confirm: true })
        .expect(200);

      const res = await accept(suggestion.id).expect(409);

      expect(res.body.message).toBe('This suggestion is no longer valid: the short reservation no longer holds any units.');
      expect(await prisma.equipmentReservation.count({ where: { equipmentId: ids.laser } })).toBe(0);
    });

    // TC-S3-95 · US-45 AC-8 · setup: tc-s3-88 + tc-s3-94 · fails if "no valid alternative" can be recorded without a reason
    // Code: NoAlternativeDto (reason required)
    it.each([undefined, '', '   '])('US-45 AC-7: "no valid alternative" needs a reason (%p)', async (reason) => {
      await noAlternative(ids.galaRes, { reason }).expect(400);
      expect(await prisma.equipmentSuggestion.count()).toBe(0);
    });

    // TC-S3-95, TC-S4-110 · US-45 AC-8, US-67 AC-4 · setup: tc-s3-88 + tc-s3-94 · fails if "no valid alternative" is not recorded, the Coordinator is not told, or the reservation changes
    // Code: EquipmentShortageActionsService.noAlternative; EquipmentNotifier.noAlternative
    it('US-45 AC-7: "no valid alternative" is recorded, and the Coordinator is told', async () => {
      const res = await noAlternative(ids.galaRes, { reason: '  Nothing else that bright  ' }).expect(201);

      expect(res.body).toMatchObject({
        status: 'NO_ALTERNATIVE',
        alternativeEquipmentId: null,
        quantity: null,
        reason: 'Nothing else that bright',
        suggestedById: ids.tech,
      });
      expect(res.body.id).toMatch(/^ESG-\d{3,}$/);
      expect(await notices('coordinator', NotificationType.EQUIPMENT_NO_ALTERNATIVE)).toEqual([
        expect.objectContaining({
          relatedEventId: ids.gala,
          message:
            'Technical Support found no valid alternative for Projector reserved for your event "Gala", ' +
            'which is short by 3. Reason: Nothing else that bright',
        }),
      ]);
      // Nothing about the reservation changes.
      expect(await reservation(ids.galaRes)).toMatchObject({ quantity: 5, status: ReservationStatus.APPROVED });
    });

    // TC-S3-96, TC-S4-110 · US-45 AC-9, US-67 AC-4 · setup: tc-s3-88 + tc-s3-94 · fails if the Coordinator does not see "no valid alternative", or the Organiser does
    // Code: latestAnswer; events view (Coordinator only)
    it('US-45 AC-7: the Coordinator sees it on the event page; the Organiser does not', async () => {
      await noAlternative(ids.galaRes, { reason: 'Nothing else that bright' }).expect(201);

      const [short] = (await coordinatorView(ids.gala)).equipmentShortages;
      expect(short).toMatchObject({
        shortBy: 3,
        openSuggestion: null,
        noAlternative: { reason: 'Nothing else that bright' },
      });

      const organiser = (await http().get(`/events/mine/${ids.gala}`).set('Authorization', as('organiser')).expect(200)).body;
      expect(organiser.equipmentShortages[0].noAlternative).toBeNull();
    });

    // TC-S3-95 · US-45 AC-8 · setup: tc-s3-88 + tc-s3-94 · fails if Technical Support's screens do not show "no valid alternative"
    // Code: EquipmentShortageActionsService.listForEvent (latestAnswer)
    it("US-45 AC-7: Technical Support's screens show it too", async () => {
      await noAlternative(ids.galaRes, { reason: 'Nothing else that bright' }).expect(201);

      expect(await techView(ids.gala)).toEqual([
        expect.objectContaining({ reservationId: ids.galaRes, noAlternative: expect.objectContaining({ reason: 'Nothing else that bright' }) }),
      ]);
    });

    // TC-S3-95 · US-45 AC-8 · setup: tc-s3-88 + tc-s3-94 · fails if "no valid alternative" can be recorded before the event is confirmed
    // Code: EquipmentShortageActionsService.noAlternative (CONFIRMED only)
    it('US-45 AC-7: "no valid alternative" only for a confirmed event', async () => {
      // Kept by design: takes the event back into planning after the shortage arose.
      await prisma.eventRequest.update({ where: { id: ids.gala }, data: { status: EventStatus.PLANNING } });
      await noAlternative(ids.galaRes, { reason: 'x' }).expect(409);
    });

    // TC-S3-95 · US-45 AC-8 · setup: tc-s3-88 + tc-s3-94 · fails if "no valid alternative" can be recorded for a reservation that is not short
    // Code: EquipmentShortageActionsService.noAlternative (shortBy > 0)
    it('US-45 AC-7: "no valid alternative" only for a reservation that is short', async () => {
      await repair(3).expect(200);
      await noAlternative(ids.galaRes, { reason: 'x' }).expect(409);
    });

    // TC-S3-95 · US-45 AC-8 · setup: tc-s3-88 + tc-s3-94 · fails if "no valid alternative" can be recorded while a suggestion is open
    // Code: EquipmentShortageActionsService.noAlternative (409)
    it('US-45 AC-7: not while a suggestion is open — the Coordinator decides that first', async () => {
      await suggestLaser().expect(201);
      const res = await noAlternative(ids.galaRes, { reason: 'x' }).expect(409);
      expect(res.body.message).toMatch(/the Coordinator decides it first/);
    });

    // TC-S3-95 · US-45 AC-8 · setup: tc-s3-88 + tc-s3-94 · fails if "no valid alternative" can be recorded twice in a row
    // Code: EquipmentShortageActionsService.noAlternative (409)
    it('US-45 AC-7: not recorded twice in a row', async () => {
      await noAlternative(ids.galaRes, { reason: 'x' }).expect(201);
      const res = await noAlternative(ids.galaRes, { reason: 'y' }).expect(409);
      expect(res.body.message).toMatch(/already recorded/);
    });

    // TC-S3-95, TC-S3-96 · US-45 AC-8, AC-9 · setup: tc-s3-88 + tc-s3-94 · fails if a later suggestion is refused, or does not replace "no valid alternative" on the page
    // Code: latestAnswer (newest answer wins)
    it('US-45 AC-7: an alternative can still be suggested later, and then replaces it on the page', async () => {
      await noAlternative(ids.galaRes, { reason: 'Nothing yet' }).expect(201);
      await suggestLaser().expect(201);

      const [short] = (await coordinatorView(ids.gala)).equipmentShortages;
      expect(short.noAlternative).toBeNull();
      expect(short.openSuggestion).toMatchObject({ alternativeEquipment: { id: ids.laser } });
    });

    // TC-S3-96, TC-S4-110 · US-45 AC-9, US-67 AC-4 · setup: tc-s3-88 + tc-s3-94 · fails if "no valid alternative" can be accepted or declined
    // Code: EquipmentShortageActionsService (OPEN only, 409)
    it('US-45 AC-7: there is nothing to accept or decline on "no valid alternative"', async () => {
      const { body } = await noAlternative(ids.galaRes, { reason: 'x' }).expect(201);
      await accept(body.id).expect(409);
      await decline(body.id).expect(409);
    });

    // TC-S3-95 · US-45 AC-8 · setup: tc-s3-88 + tc-s3-94 · fails if another role can record "no valid alternative"
    // Code: EquipmentShortageController (@Roles TECHNICAL_SUPPORT_STAFF)
    it('US-45 AC-7: only Technical Support may record it', async () => {
      await noAlternative(ids.galaRes, { reason: 'x' }, 'coordinator').expect(403);
    });

    // TC-S3-95 · US-45 AC-8 · setup: tc-s3-88 + tc-s3-94 · fails if the database stores "no valid alternative" naming an item
    // Code: EquipmentSuggestion_no_alternative_names_nothing CHECK
    it('US-45 AC-7: the database requires a "no valid alternative" record to name no item', async () => {
      await expect(
        prisma.equipmentSuggestion.create({
          data: {
            reservationId: ids.galaRes,
            status: 'NO_ALTERNATIVE',
            alternativeEquipmentId: ids.laser,
            quantity: 3,
            reason: 'x',
            suggestedById: ids.tech,
          },
        }),
      ).rejects.toThrow();
    });
  });
});
