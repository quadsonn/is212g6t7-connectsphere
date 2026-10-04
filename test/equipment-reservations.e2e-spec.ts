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
import { EquipmentReservationsService } from '../src/equipment/equipment-reservations.service';
import { EventsService } from '../src/events/events.service';

/**
 * US-31, US-32, US-33 e2e — and their interaction with US-30, since all four
 * read or write the same reservation data. One describe per acceptance
 * criterion, named "US-xx AC-n" for traceability.
 *
 * US-33 is triggered by moving the event to CANCELLED through
 * EventsService.setStatus() — the only sanctioned writer of an event's status
 * (events-status-audit.spec.ts). No cancel endpoint exists; #43 will add one
 * and call the same method.
 */
describe('US-31/32/33 equipment requirements, commitment and release (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let events: EventsService;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  // The main event's window, and windows relative to it.
  const START = '2030-10-01T09:00:00.000Z';
  const END = '2030-10-01T17:00:00.000Z';

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const commit = (eventId: string, equipmentId: string, quantity: number, who = 'tech') =>
    http()
      .post('/equipment/reservations')
      .set('Authorization', as(who))
      .send({ eventId, equipmentId, quantity });

  const availability = (equipmentId: string, quantity: number, start = START, end = END) =>
    http()
      .get(`/equipment/${equipmentId}/availability`)
      .query({ start, end, quantity })
      .set('Authorization', as('tech'));

  const cancel = async (eventId: string) => {
    const event = await prisma.eventRequest.findUniqueOrThrow({ where: { id: eventId } });
    return events.setStatus(event, EventStatus.CANCELLED);
  };

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: key, role },
    });
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
    ids[key] = user.id;
  };

  const seedEvent = (
    name: string,
    overrides: {
      start?: string;
      end?: string;
      status?: EventStatus;
      equipmentNeeds?: string | null;
      coordinatorId?: string | null;
    } = {},
  ) =>
    prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        coordinatorId:
          overrides.coordinatorId === undefined ? ids.coordinator : overrides.coordinatorId,
        name,
        purpose: 'Purpose',
        description: 'Description',
        category: 'Conference',
        proposedStart: new Date(overrides.start ?? START),
        proposedEnd: new Date(overrides.end ?? END),
        expectedAttendance: 100,
        equipmentNeeds:
          overrides.equipmentNeeds === undefined
            ? 'Six wireless microphones and a PA system.'
            : overrides.equipmentNeeds,
        status: overrides.status ?? EventStatus.PLANNING,
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
    events = app.get(EventsService);
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
      await prisma.equipment.create({
        data: { type: 'Wireless microphone', totalQuantity: 10, location: 'AV Store' },
      })
    ).id;
    ids.pa = (
      await prisma.equipment.create({ data: { type: 'Portable PA system', totalQuantity: 4 } })
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

    ids.event = (await seedEvent('Capstone Showcase')).id;
    // Overlaps the main event (12:00–20:00 against 09:00–17:00).
    ids.overlapping = (
      await seedEvent('Industry Night', {
        start: '2030-10-01T12:00:00.000Z',
        end: '2030-10-01T20:00:00.000Z',
      })
    ).id;
    // Starts exactly when the main event ends — back-to-back, not overlapping.
    ids.backToBack = (
      await seedEvent('Evening Mixer', {
        start: '2030-10-01T17:00:00.000Z',
        end: '2030-10-01T21:00:00.000Z',
      })
    ).id;
    ids.nextDay = (
      await seedEvent('Alumni Day', {
        start: '2030-10-02T09:00:00.000Z',
        end: '2030-10-02T17:00:00.000Z',
      })
    ).id;
  });

  // -------------------------------------------------------------------------
  // US-31 — view equipment and technical requirements described for an event
  // -------------------------------------------------------------------------

  describe('US-31 AC-1/AC-2: the recorded requirements are visible, including what was requested', () => {
    it('lists events with the Organiser’s equipment needs text in full', async () => {
      const res = await http()
        .get('/equipment/requirements')
        .set('Authorization', as('tech'))
        .expect(200);

      const view = res.body.find((e: { eventId: string }) => e.eventId === ids.event);
      expect(view).toEqual({
        eventId: ids.event,
        name: 'Capstone Showcase',
        status: 'PLANNING',
        proposedStart: START,
        proposedEnd: END,
        organiserEquipmentNeeds: 'Six wireless microphones and a PA system.',
        hasRequirements: true,
        message: null,
      });
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('shows one event’s requirements by id', async () => {
      const res = await http()
        .get(`/equipment/requirements/${ids.event}`)
        .set('Authorization', as('tech'))
        .expect(200);

      expect(res.body.organiserEquipmentNeeds).toBe('Six wireless microphones and a PA system.');
    });

    it('does not expose other planning fields of the event', async () => {
      const res = await http()
        .get(`/equipment/requirements/${ids.event}`)
        .set('Authorization', as('tech'))
        .expect(200);

      expect(res.body).not.toHaveProperty('expectedAttendance');
      expect(res.body).not.toHaveProperty('organiserId');
    });
  });

  describe('US-31 AC-3: no requirements recorded is clearly indicated', () => {
    it.each([
      ['null', null],
      ['whitespace-only', '   '],
    ])('reports %s equipment needs as none recorded, with a message', async (_label, equipmentNeeds) => {
      const bare = await seedEvent('Quiet Talk', { equipmentNeeds });

      const res = await http()
        .get(`/equipment/requirements/${bare.id}`)
        .set('Authorization', as('tech'))
        .expect(200);

      expect(res.body).toMatchObject({
        hasRequirements: false,
        organiserEquipmentNeeds: null,
        message: 'No equipment or technical requirements have been recorded for this event.',
      });
    });
  });

  describe('US-31 AC-4: only submitted events with requirements; drafts are not visible', () => {
    it('leaves drafts and events without requirements out of the list', async () => {
      const draft = await seedEvent('Draft Gala', { status: EventStatus.DRAFT });
      const bare = await seedEvent('Quiet Talk', { equipmentNeeds: null });
      const blank = await seedEvent('Blank Talk', { equipmentNeeds: '  ' });
      const submitted = await seedEvent('Fresh Request', { status: EventStatus.SUBMITTED });

      const res = await http()
        .get('/equipment/requirements')
        .set('Authorization', as('tech'))
        .expect(200);

      const listed = res.body.map((e: { eventId: string }) => e.eventId);
      expect(listed).toContain(submitted.id);
      expect(listed).not.toContain(draft.id);
      expect(listed).not.toContain(bare.id);
      expect(listed).not.toContain(blank.id);
    });

    it('404s for a draft event, even one with requirements', async () => {
      const draft = await seedEvent('Draft Gala', { status: EventStatus.DRAFT });

      await http()
        .get(`/equipment/requirements/${draft.id}`)
        .set('Authorization', as('tech'))
        .expect(404);
    });

    it.each(['coordinator', 'organiser', 'attendee', 'venueStaff'])(
      'is refused to %s — Technical Support only',
      async (who) => {
        await http().get('/equipment/requirements').set('Authorization', as(who)).expect(403);
        await http()
          .get(`/equipment/requirements/${ids.event}`)
          .set('Authorization', as(who))
          .expect(403);
      },
    );

    it('is refused without a token', async () => {
      await http().get('/equipment/requirements').expect(401);
    });
  });

  // -------------------------------------------------------------------------
  // US-32 — reserve available equipment for an event
  // -------------------------------------------------------------------------

  describe('US-32 AC-1: an item and quantity can be committed to an event for its date and time', () => {
    it('commits the quantity over the event’s own window', async () => {
      const res = await commit(ids.event, ids.mic, 4).expect(201);

      expect(res.body).toMatchObject({
        eventId: ids.event,
        equipmentId: ids.mic,
        quantity: 4,
        start: START,
        end: END,
        status: 'APPROVED',
        equipment: { id: ids.mic, type: 'Wireless microphone' },
      });
      const row = await prisma.equipmentReservation.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(row.status).toBe(ReservationStatus.APPROVED);
    });

    it.each([
      ['a draft', EventStatus.DRAFT],
      ['a rejected', EventStatus.REJECTED],
      ['a cancelled', EventStatus.CANCELLED],
      ['a completed', EventStatus.COMPLETED],
    ])('refuses %s event', async (_label, status) => {
      const event = await seedEvent('Not live', { status });

      const res = await commit(event.id, ids.mic, 1).expect(409);
      expect(res.body.message).toMatch(new RegExp(`event that is ${status}`));
    });

    it('404s for an unknown event or unknown equipment', async () => {
      await commit('no-such-event', ids.mic, 1).expect(404);
      await commit(ids.event, 'no-such-equipment', 1).expect(404);
    });

    it.each([0, -1, 1.5, 'two'])('rejects a quantity of %p', async (quantity) => {
      await http()
        .post('/equipment/reservations')
        .set('Authorization', as('tech'))
        .send({ eventId: ids.event, equipmentId: ids.mic, quantity })
        .expect(400);
    });

    it.each(['coordinator', 'organiser', 'attendee', 'venueStaff'])(
      'is refused to %s — Technical Support only',
      async (who) => {
        await commit(ids.event, ids.mic, 1, who).expect(403);
        expect(await prisma.equipmentReservation.count()).toBe(0);
      },
    );

    it('is refused without a token', async () => {
      await http()
        .post('/equipment/reservations')
        .send({ eventId: ids.event, equipmentId: ids.mic, quantity: 1 })
        .expect(401);
    });
  });

  describe('US-32 AC-2: a committed quantity is immediately locked for overlapping periods', () => {
    it('is excluded from the very next availability check for an overlapping window (US-30)', async () => {
      await commit(ids.event, ids.mic, 4).expect(201);

      const res = await availability(ids.mic, 1, '2030-10-01T16:00:00.000Z', '2030-10-01T18:00:00.000Z').expect(200);
      expect(res.body).toMatchObject({ reservedQuantity: 4, availableQuantity: 6 });
    });

    it('cannot be committed again to an overlapping event', async () => {
      await commit(ids.event, ids.mic, 7).expect(201);

      await commit(ids.overlapping, ids.mic, 4).expect(409);
      await commit(ids.overlapping, ids.mic, 3).expect(201);
    });

    it('does not lock non-overlapping periods, including back-to-back', async () => {
      await commit(ids.event, ids.mic, 10).expect(201);

      await commit(ids.backToBack, ids.mic, 10).expect(201);
      await commit(ids.nextDay, ids.mic, 10).expect(201);
    });

    it('locks only the item committed, not other items', async () => {
      await commit(ids.event, ids.mic, 10).expect(201);

      await commit(ids.overlapping, ids.pa, 4).expect(201);
    });

    it('counts the same event’s earlier commitment too — the units are physically in use', async () => {
      await commit(ids.event, ids.mic, 6).expect(201);

      await commit(ids.event, ids.mic, 5).expect(409);
      await commit(ids.event, ids.mic, 4).expect(201);
    });

    it('lets exactly one of two simultaneous over-committing requests through', async () => {
      // 6 + 6 > 10: without the row lock both would read 10 free and succeed.
      const results = await Promise.all([
        commit(ids.event, ids.mic, 6),
        commit(ids.overlapping, ids.mic, 6),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const held = await prisma.equipmentReservation.aggregate({
        where: { equipmentId: ids.mic, status: ReservationStatus.APPROVED },
        _sum: { quantity: true },
      });
      expect(held._sum.quantity).toBe(6);
    });
  });

  describe('US-32 AC-3: committing a quantity already locked elsewhere is rejected with the reason', () => {
    it('rejects one unit more than is free, stating free, requested and committed counts', async () => {
      await commit(ids.overlapping, ids.mic, 4).expect(201);

      const res = await commit(ids.event, ids.mic, 7).expect(409);

      expect(res.body.message).toBe(
        'Only 6 of the 7 Wireless microphone requested are free for ' +
          '2030-10-01T09:00:00.000Z – 2030-10-01T17:00:00.000Z: 4 of 10 are ' +
          'already committed to an overlapping period.',
      );
    });

    it('accepts exactly the free quantity (boundary)', async () => {
      await commit(ids.overlapping, ids.mic, 4).expect(201);

      await commit(ids.event, ids.mic, 6).expect(201);
    });

    it('rejects equipment under maintenance, saying so', async () => {
      const res = await commit(ids.event, ids.projector, 1).expect(409);

      expect(res.body.message).toBe(
        'Projector (4K) is under maintenance, so none of it can be committed.',
      );
    });

    it('creates nothing when rejected', async () => {
      await commit(ids.overlapping, ids.mic, 10).expect(201);
      await commit(ids.event, ids.mic, 1).expect(409);

      expect(
        await prisma.equipmentReservation.count({ where: { eventId: ids.event } }),
      ).toBe(0);
    });
  });

  describe('US-32 AC-4: the assigned Coordinator is notified once the commitment is confirmed', () => {
    it('records an in-app notification for the assigned Coordinator', async () => {
      await commit(ids.event, ids.mic, 2).expect(201);

      const notes = await prisma.notification.findMany({
        where: { recipientId: ids.coordinator },
      });
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({
        type: NotificationType.EQUIPMENT_RESERVATION_DECIDED,
        relatedEventId: ids.event,
        read: false,
      });
      expect(notes[0].message).toContain('2 × Wireless microphone committed to "Capstone Showcase"');
    });

    it('notifies nobody when the commitment is rejected', async () => {
      await commit(ids.event, ids.projector, 1).expect(409);

      expect(await prisma.notification.count()).toBe(0);
    });

    it('still commits, notifying nobody, when the event has no assigned Coordinator', async () => {
      const unassigned = await seedEvent('Unassigned', {
        status: EventStatus.SUBMITTED,
        coordinatorId: null,
      });

      await commit(unassigned.id, ids.mic, 1).expect(201);
      expect(await prisma.notification.count()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // US-33 — release equipment reservations for a cancelled event
  // -------------------------------------------------------------------------

  describe('US-33 AC-1: cancelling an event releases all of its reservations', () => {
    it('marks every reservation the event held as RELEASED, with a timestamp', async () => {
      await commit(ids.event, ids.mic, 4).expect(201);
      await commit(ids.event, ids.pa, 2).expect(201);

      await cancel(ids.event);

      const rows = await prisma.equipmentReservation.findMany({ where: { eventId: ids.event } });
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.status).toBe(ReservationStatus.RELEASED);
        expect(row.releasedAt).toBeInstanceOf(Date);
      }
      const event = await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.event } });
      expect(event.status).toBe(EventStatus.CANCELLED);
    });

    it('releases a still-pending (REQUESTED) reservation too, leaving a REJECTED one alone', async () => {
      const window = { start: new Date(START), end: new Date(END) };
      const pending = await prisma.equipmentReservation.create({
        data: { eventId: ids.event, equipmentId: ids.mic, quantity: 1, ...window },
      });
      const rejected = await prisma.equipmentReservation.create({
        data: {
          eventId: ids.event,
          equipmentId: ids.pa,
          quantity: 1,
          ...window,
          status: ReservationStatus.REJECTED,
        },
      });

      await cancel(ids.event);

      const after = await prisma.equipmentReservation.findMany({
        where: { id: { in: [pending.id, rejected.id] } },
      });
      const byId = Object.fromEntries(after.map((r) => [r.id, r]));
      expect(byId[pending.id].status).toBe(ReservationStatus.RELEASED);
      expect(byId[rejected.id]).toMatchObject({
        status: ReservationStatus.REJECTED,
        releasedAt: null,
      });
    });

    it('releases nothing when the event moves to any status other than CANCELLED', async () => {
      await commit(ids.event, ids.mic, 4).expect(201);
      const event = await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.event } });

      await events.setStatus(event, EventStatus.CONFIRMED);

      const row = await prisma.equipmentReservation.findFirstOrThrow({
        where: { eventId: ids.event },
      });
      expect(row.status).toBe(ReservationStatus.APPROVED);
    });
  });

  describe('US-33 AC-2: released equipment is available again for the same period', () => {
    it('restores the units in the availability check for the same window (US-30)', async () => {
      await commit(ids.event, ids.mic, 10).expect(201);
      const before = await availability(ids.mic, 10).expect(200);
      expect(before.body).toMatchObject({ availableQuantity: 0, fullyAvailable: false });

      await cancel(ids.event);

      const after = await availability(ids.mic, 10).expect(200);
      expect(after.body).toMatchObject({
        reservedQuantity: 0,
        availableQuantity: 10,
        fullyAvailable: true,
      });
    });

    it('lets the released units be committed to an overlapping event (US-32)', async () => {
      await commit(ids.event, ids.mic, 10).expect(201);
      await commit(ids.overlapping, ids.mic, 10).expect(409);

      await cancel(ids.event);

      await commit(ids.overlapping, ids.mic, 10).expect(201);
    });
  });

  describe('US-33 AC-3: Technical Support can see what was released, for which cancelled event', () => {
    it('lists released reservations with the equipment and the cancelled event', async () => {
      await commit(ids.event, ids.mic, 4).expect(201);
      await commit(ids.overlapping, ids.pa, 1).expect(201);
      await cancel(ids.event);

      const res = await http()
        .get('/equipment/reservations/released')
        .set('Authorization', as('tech'))
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        quantity: 4,
        start: START,
        end: END,
        status: 'RELEASED',
        equipment: { id: ids.mic, type: 'Wireless microphone' },
        event: { id: ids.event, name: 'Capstone Showcase', status: 'CANCELLED' },
      });
      expect(new Date(res.body[0].releasedAt).getTime()).not.toBeNaN();
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('is empty when nothing has been released', async () => {
      const res = await http()
        .get('/equipment/reservations/released')
        .set('Authorization', as('tech'))
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it.each(['coordinator', 'organiser', 'attendee', 'venueStaff'])(
      'is refused to %s — Technical Support only',
      async (who) => {
        await http()
          .get('/equipment/reservations/released')
          .set('Authorization', as(who))
          .expect(403);
      },
    );
  });

  describe('US-33 AC-4: release affects only that event, and never releases twice', () => {
    it('leaves other events’ reservations of the same item held', async () => {
      await commit(ids.event, ids.mic, 4).expect(201);
      await commit(ids.nextDay, ids.mic, 3).expect(201);

      await cancel(ids.event);

      const other = await prisma.equipmentReservation.findFirstOrThrow({
        where: { eventId: ids.nextDay },
      });
      expect(other).toMatchObject({ status: ReservationStatus.APPROVED, releasedAt: null });
    });

    it('does not re-release an already-released reservation (its releasedAt is kept)', async () => {
      const earlier = new Date('2030-01-01T00:00:00.000Z');
      const old = await prisma.equipmentReservation.create({
        data: {
          eventId: ids.event,
          equipmentId: ids.mic,
          quantity: 2,
          start: new Date(START),
          end: new Date(END),
          status: ReservationStatus.RELEASED,
          releasedAt: earlier,
        },
      });

      await cancel(ids.event);

      const after = await prisma.equipmentReservation.findUniqueOrThrow({ where: { id: old.id } });
      expect(after.releasedAt).toEqual(earlier);
    });

    it('a second release of the same cancelled event changes nothing', async () => {
      await commit(ids.event, ids.mic, 4).expect(201);
      await cancel(ids.event);
      const first = await prisma.equipmentReservation.findFirstOrThrow({
        where: { eventId: ids.event },
      });

      const releasedAgain = await prisma.$transaction((tx) =>
        app.get(EquipmentReservationsService).releaseForCancelledEvent(ids.event, tx),
      );
      await cancel(ids.event); // CANCELLED -> CANCELLED is a no-op in setStatus

      expect(releasedAgain).toBe(0);
      const second = await prisma.equipmentReservation.findFirstOrThrow({
        where: { eventId: ids.event },
      });
      expect(second.releasedAt).toEqual(first.releasedAt);
    });
  });
});
