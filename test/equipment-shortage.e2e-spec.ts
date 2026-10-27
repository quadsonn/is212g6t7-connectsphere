import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  EquipmentStatus,
  EquipmentSuggestionStatus,
  EventStatus,
  NotificationType,
  PrismaClient,
  ReservationStatus,
  Role,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { listenOnLoopback } from './listen-on-loopback';

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
 */
describe('US-45 resolving an equipment shortage (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const START = '2030-10-01T09:00:00.000Z';
  const END = '2030-10-01T17:00:00.000Z';

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

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

  const decline = (suggestionId: string, who = 'coordinator') =>
    http().post(`/equipment/suggestions/${suggestionId}/decline`).set('Authorization', as(who));

  const coordinatorView = async (eventId: string) =>
    (await http().get(`/events/assigned/${eventId}`).set('Authorization', as('coordinator')).expect(200)).body;

  const techView = async (eventId: string) =>
    (await http().get(`/equipment/events/${eventId}/reservations`).set('Authorization', as('tech')).expect(200)).body;

  const reservation = (id: string) => prisma.equipmentReservation.findUniqueOrThrow({ where: { id } });

  const notices = (who: string, type: NotificationType) =>
    prisma.notification.findMany({ where: { recipientId: ids[who], type } });

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: key, role },
    });
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
    ids[key] = user.id;
  };

  const seedEvent = async (
    name: string,
    status: EventStatus = EventStatus.CONFIRMED,
    start = START,
    end = END,
  ) =>
    (
      await prisma.eventRequest.create({
        data: {
          organiserId: ids.organiser,
          coordinatorId: ids.coordinator,
          technicalSupportId: ids.tech2,
          name,
          purpose: 'p',
          description: 'd',
          category: 'c',
          proposedStart: new Date(start),
          proposedEnd: new Date(end),
          expectedAttendance: 100,
          status,
        },
      })
    ).id;

  const seedReservation = async (eventId: string, quantity: number, equipmentId = ids.projector, start = START, end = END) =>
    (
      await prisma.equipmentReservation.create({
        data: {
          eventId,
          equipmentId,
          quantity,
          start: new Date(start),
          end: new Date(end),
          status: ReservationStatus.APPROVED,
        },
      })
    ).id;

  const clear = async () => {
    await prisma.eventChange.deleteMany();
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
    await seedUser('otherCoordinator', 'other@example.com', Role.EVENT_COORDINATOR);
    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);

    ids.projector = (await prisma.equipment.create({ data: { type: 'Projector', totalQuantity: 10 } })).id;
    ids.laser = (await prisma.equipment.create({ data: { type: 'Laser projector', totalQuantity: 4 } })).id;
    ids.screen = (await prisma.equipment.create({ data: { type: 'Screen', totalQuantity: 1 } })).id;

    // Two confirmed events holding 5 projectors each at the same time.
    ids.gala = await seedEvent('Gala');
    ids.fair = await seedEvent('Fair');
    ids.galaRes = await seedReservation(ids.gala, 5);
    ids.fairRes = await seedReservation(ids.fair, 5);
  });

  describe('US-45 AC-5: affected reservations are flagged "Short by N"', () => {
    it('US-45 AC-5: on the Coordinator\'s event page, with how many short', async () => {
      await markDamaged(3).expect(200);

      const view = await coordinatorView(ids.gala);

      expect(view.equipmentShortages).toEqual([
        expect.objectContaining({ reservationId: ids.galaRes, equipmentType: 'Projector', quantity: 5, shortBy: 3 }),
      ]);
    });

    it("US-45 AC-5: on the Organiser's event page too", async () => {
      await markDamaged(3).expect(200);

      const view = (await http().get(`/events/mine/${ids.gala}`).set('Authorization', as('organiser')).expect(200)).body;

      expect(view.equipmentShortages).toEqual([expect.objectContaining({ reservationId: ids.galaRes, shortBy: 3 })]);
    });

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

    it('US-45 AC-5: nothing is flagged while the working units cover every reservation', async () => {
      // 10 working for 5 + 5 reserved.
      expect((await coordinatorView(ids.gala)).equipmentShortages).toEqual([]);
      expect(await techView(ids.gala)).toEqual([expect.objectContaining({ shortBy: 0 })]);
    });

    it('US-45 AC-5: the flag clears by itself after a repair', async () => {
      await markDamaged(3).expect(200);
      await repair(3).expect(200);

      expect((await coordinatorView(ids.gala)).equipmentShortages).toEqual([]);
    });

    it('US-45 AC-5: the flag clears by itself once a reservation is reduced to fit', async () => {
      await markDamaged(3).expect(200);
      await reduce(ids.fairRes, { quantity: 2, reason: 'Fair can manage with 2' }).expect(200);

      expect((await coordinatorView(ids.gala)).equipmentShortages).toEqual([]);
      expect((await coordinatorView(ids.fair)).equipmentShortages).toEqual([]);
    });

    it('US-45 AC-5: a reservation already over is never flagged', async () => {
      const past = await seedEvent('Last year', EventStatus.COMPLETED, '2020-10-01T09:00:00.000Z', '2020-10-01T17:00:00.000Z');
      await seedReservation(past, 10, ids.projector, '2020-10-01T09:00:00.000Z', '2020-10-01T17:00:00.000Z');

      await markDamaged(10).expect(200);

      expect((await coordinatorView(past)).equipmentShortages).toEqual([]);
    });
  });

  describe('US-45 AC-6: Technical Support reduce or release a reservation, with a reason', () => {
    beforeEach(async () => {
      await markDamaged(3).expect(200);
      await prisma.notification.deleteMany();
    });

    it.each([undefined, '', '   '])('US-45 AC-6: reducing needs a reason (%p)', async (reason) => {
      await reduce(ids.galaRes, { quantity: 2, reason }).expect(400);
      expect(await reservation(ids.galaRes)).toMatchObject({ quantity: 5 });
    });

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

    it('US-45 AC-6: reducing to the same or more units is refused — release it instead', async () => {
      const res = await reduce(ids.galaRes, { quantity: 5, reason: 'x' }).expect(400);
      expect(res.body.message).toEqual([
        'quantity must be fewer than the 5 reserved; to give them all back, release the reservation',
      ]);
    });

    it.each([undefined, '   '])('US-45 AC-6: releasing needs a reason (%p)', async (reason) => {
      await release(ids.galaRes, { reason }).expect(400);
      expect(await reservation(ids.galaRes)).toMatchObject({ status: ReservationStatus.APPROVED });
    });

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

    it('US-45 AC-6: a released reservation cannot be adjusted again', async () => {
      await release(ids.galaRes, { reason: 'x' }).expect(200);
      await reduce(ids.galaRes, { quantity: 1, reason: 'x' }).expect(409);
      await release(ids.galaRes, { reason: 'x' }).expect(409);
    });

    it('US-45 AC-6: a reservation already over cannot be adjusted', async () => {
      const past = await seedEvent('Last year', EventStatus.COMPLETED, '2020-10-01T09:00:00.000Z', '2020-10-01T17:00:00.000Z');
      const pastRes = await seedReservation(past, 4, ids.projector, '2020-10-01T09:00:00.000Z', '2020-10-01T17:00:00.000Z');

      await reduce(pastRes, { quantity: 1, reason: 'x' }).expect(409);
    });

    it.each(['coordinator', 'organiser'])('US-45 AC-6: only Technical Support may adjust (%s is refused)', async (who) => {
      await reduce(ids.galaRes, { quantity: 2, reason: 'x' }, who).expect(403);
      await release(ids.galaRes, { reason: 'x' }, who).expect(403);
      expect(await reservation(ids.galaRes)).toMatchObject({ quantity: 5, status: ReservationStatus.APPROVED });
    });

    it('US-45 AC-6: 404s for a reservation that does not exist', async () => {
      await reduce('RSV-999999', { quantity: 1, reason: 'x' }).expect(404);
    });
  });

  describe('US-45 AC-7: an alternative item for a confirmed event', () => {
    beforeEach(async () => {
      // 7 projectors work for 10 reserved: Gala and Fair are each short by 3.
      await markDamaged(3).expect(200);
      await prisma.notification.deleteMany();
    });

    const suggestLaser = (quantity = 3, reservationId = ids.galaRes) =>
      suggest(reservationId, { alternativeEquipmentId: ids.laser, quantity, reason: 'Same brightness' });

    it('US-45 AC-7: offers only other items free in the needed quantity', async () => {
      const res = await http()
        .get(`/equipment/reservations/${ids.galaRes}/alternatives`)
        .query({ quantity: 3 })
        .set('Authorization', as('tech'))
        .expect(200);

      // Laser has 4 free; Screen has only 1; Projector is the short item itself.
      expect(res.body).toEqual([{ equipmentId: ids.laser, type: 'Laser projector', location: null, availableQuantity: 4 }]);
    });

    it('US-45 AC-7: suggesting needs a reason', async () => {
      await suggest(ids.galaRes, { alternativeEquipmentId: ids.laser, quantity: 3, reason: ' ' }).expect(400);
      expect(await prisma.equipmentSuggestion.count()).toBe(0);
    });

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

    it('US-45 AC-7: only from items available in that quantity for the event\'s time', async () => {
      const res = await suggest(ids.galaRes, { alternativeEquipmentId: ids.screen, quantity: 3, reason: 'x' }).expect(409);
      expect(res.body.message).toBe("only 1 Screen are free for the event's date and time");
    });

    it('US-45 AC-7: never the short item itself', async () => {
      await suggest(ids.galaRes, { alternativeEquipmentId: ids.projector, quantity: 3, reason: 'x' }).expect(400);
    });

    it('US-45 AC-7: only for a confirmed event', async () => {
      await prisma.eventRequest.update({ where: { id: ids.gala }, data: { status: EventStatus.PLANNING } });
      const res = await suggestLaser().expect(409);
      expect(res.body.message).toMatch(/only for a confirmed event/);
    });

    it('US-45 AC-7: only for a reservation that is short', async () => {
      await repair(3).expect(200);
      await suggestLaser().expect(409);
    });

    it('US-45 AC-7: only one open suggestion per short reservation at a time', async () => {
      await suggestLaser(2).expect(201);
      const second = await suggestLaser(3).expect(409);
      expect(second.body.message).toMatch(/already has an open suggestion/);

      // Once decided, another may be made.
      const [open] = await prisma.equipmentSuggestion.findMany();
      await decline(open.id).expect(200);
      await suggestLaser(3).expect(201);
    });

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

    it('US-45 AC-7: becomes invalid if the alternative is no longer available when accepted', async () => {
      const { body: suggestion } = await suggestLaser(3).expect(201);
      // Meanwhile 2 of the 4 laser projectors go to another event.
      await seedReservation(ids.fair, 2, ids.laser);

      const res = await accept(suggestion.id).expect(409);

      expect(res.body.message).toBe('This suggestion is no longer valid: only 2 Laser projector are free now.');
      expect(await prisma.equipmentSuggestion.findUniqueOrThrow({ where: { id: suggestion.id } })).toMatchObject({
        status: EquipmentSuggestionStatus.INVALID,
      });
      expect(await reservation(ids.galaRes)).toMatchObject({ quantity: 5 });
      expect(await prisma.equipmentReservation.count({ where: { eventId: ids.gala, equipmentId: ids.laser } })).toBe(0);
    });

    it('US-45 AC-7: a suggestion cannot be decided twice', async () => {
      const { body: suggestion } = await suggestLaser().expect(201);
      await decline(suggestion.id).expect(200);
      await accept(suggestion.id).expect(409);
      await decline(suggestion.id).expect(409);
    });

    it('US-45 AC-7: a simultaneous accept and decline — exactly one wins', async () => {
      const { body: suggestion } = await suggestLaser().expect(201);

      const results = await Promise.all([accept(suggestion.id), decline(suggestion.id)]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const laserReserved = await prisma.equipmentReservation.count({ where: { equipmentId: ids.laser } });
      const final = await prisma.equipmentSuggestion.findUniqueOrThrow({ where: { id: suggestion.id } });
      expect(laserReserved).toBe(final.status === EquipmentSuggestionStatus.ACCEPTED ? 1 : 0);
    });

    it("US-45 AC-7: only the event's own Coordinator decides; Technical Support cannot", async () => {
      const { body: suggestion } = await suggestLaser().expect(201);

      await accept(suggestion.id, 'otherCoordinator').expect(404);
      await decline(suggestion.id, 'otherCoordinator').expect(404);
      await accept(suggestion.id, 'tech').expect(403);
      expect(await prisma.equipmentSuggestion.findUniqueOrThrow({ where: { id: suggestion.id } })).toMatchObject({
        status: EquipmentSuggestionStatus.OPEN,
      });
    });

    it('US-45 AC-7: releasing the short reservation closes its open suggestion', async () => {
      const { body: suggestion } = await suggestLaser().expect(201);

      await release(ids.galaRes, { reason: 'Not needed' }).expect(200);

      expect(await prisma.equipmentSuggestion.findUniqueOrThrow({ where: { id: suggestion.id } })).toMatchObject({
        status: EquipmentSuggestionStatus.INVALID,
      });
      await accept(suggestion.id).expect(409);
    });
  });
});
