import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BookingStatus,
  EventStatus,
  NotificationType,
  PrismaClient,
  ReservationStatus,
  Role,
  VenueStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { listenOnLoopback } from './listen-on-loopback';

/**
 * US-47 e2e — the Coordinator rejects an approved request that cannot be
 * fulfilled. One describe per acceptance criterion, named "US-47 AC-n".
 */
describe('US-47 reject unfulfillable request (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const START = '2030-10-01T01:00:00.000Z';
  const END = '2030-10-01T09:00:00.000Z';

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const reject = (body: object, who = 'coordinator', event = 'gala') =>
    http()
      .post(`/events/${ids[event]}/reject-unfulfillable`)
      .set('Authorization', as(who))
      .send(body);

  const VALID = { reason: 'NO_SUITABLE_VENUE', comment: 'Every hall is booked that week.' };

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: key, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  const seedEvent = async (key: string, status: EventStatus = EventStatus.PLANNING) => {
    const event = await prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        coordinatorId: ids.coordinator,
        name: key,
        purpose: 'p',
        description: 'd',
        category: 'c',
        proposedStart: new Date(START),
        proposedEnd: new Date(END),
        expectedAttendance: 120,
        equipmentNeeds: 'Projectors',
        status,
      },
    });
    ids[key] = event.id;
    return event;
  };

  const seedBooking = (key: string, event: string, venue: string, status: BookingStatus) =>
    prisma.venueBooking
      .create({
        data: {
          eventId: ids[event],
          venueId: ids[venue],
          start: new Date(START),
          end: new Date(END),
          status,
          expectedAttendance: 120,
        },
      })
      .then((b) => (ids[key] = b.id));

  const seedReservation = (key: string, event: string, quantity: number, status: ReservationStatus) =>
    prisma.equipmentReservation
      .create({
        data: {
          eventId: ids[event],
          equipmentId: ids.projector,
          quantity,
          start: new Date(START),
          end: new Date(END),
          status,
        },
      })
      .then((r) => (ids[key] = r.id));

  const clear = async () => {
    await prisma.notification.deleteMany();
    await prisma.equipmentReservation.deleteMany();
    await prisma.equipment.deleteMany();
    await prisma.bookingSuggestion.deleteMany();
    await prisma.bookingDecision.deleteMany();
    await prisma.venueBooking.updateMany({ data: { replacesBookingId: null, replacedByBookingId: null } });
    await prisma.venueBooking.deleteMany();
    await prisma.venue.deleteMany();
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

    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);
    await seedUser('otherCoordinator', 'other@example.com', Role.EVENT_COORDINATOR);
    await seedUser('staff', 'staff@example.com', Role.VENUE_STAFF);
    await seedUser('tech', 'tech@example.com', Role.TECHNICAL_SUPPORT_STAFF);
    await seedUser('attendee', 'attendee@example.com', Role.ATTENDEE);

    for (const name of ['hallA', 'hallB', 'hallC']) {
      ids[name] = (
        await prisma.venue.create({
          data: {
            name,
            location: 'Campus',
            capacity: 300,
            facilities: [],
            accessibilityFeatures: [],
            status: VenueStatus.PUBLISHED,
            managedById: ids.staff,
          },
        })
      ).id;
    }
    ids.projector = (
      await prisma.equipment.create({ data: { type: 'Projector', totalQuantity: 4 } })
    ).id;

    // The event holds a pending hold, an approved booking, a rejected
    // request, and two equipment reservations.
    await seedEvent('gala');
    await seedBooking('pendingHold', 'gala', 'hallA', BookingStatus.REQUESTED);
    await seedBooking('approvedBooking', 'gala', 'hallB', BookingStatus.APPROVED);
    await seedBooking('rejectedRequest', 'gala', 'hallC', BookingStatus.REJECTED);
    await seedReservation('committed', 'gala', 3, ReservationStatus.APPROVED);
    await seedReservation('requested', 'gala', 1, ReservationStatus.REQUESTED);
  });

  describe('US-47 AC-1/AC-4: rejecting from the event sets it to Rejected through the normal path', () => {
    it('rejects the event and stores the reason and comment', async () => {
      const res = await reject(VALID).expect(200);

      expect(res.body).toEqual({
        eventId: ids.gala,
        status: 'REJECTED',
        decisionReason: 'No suitable venue: Every hall is booked that week.',
        releasedVenueBookings: 2,
        releasedEquipmentReservations: 2,
      });
      const event = await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.gala } });
      expect(event.status).toBe(EventStatus.REJECTED);
    });

    it('changes nothing else about the event', async () => {
      const before = await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.gala } });

      await reject(VALID).expect(200);

      const after = await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.gala } });
      const { status: _s1, decisionReason: _d1, updatedAt: _u1, ...rest } = after;
      const { status: _s2, decisionReason: _d2, updatedAt: _u2, ...restBefore } = before;
      expect(rest).toEqual(restBefore);
    });

    it.each([EventStatus.APPROVED, EventStatus.AWAITING_ARRANGEMENTS])(
      'is allowed from %s too',
      async (status) => {
        await seedEvent('other', status);
        await reject(VALID, 'coordinator', 'other').expect(200);
      },
    );

    it.each([
      EventStatus.SUBMITTED,
      EventStatus.UNDER_REVIEW,
      EventStatus.CONFIRMED,
      EventStatus.COMPLETED,
      EventStatus.CANCELLED,
      EventStatus.REJECTED,
    ])('is refused from %s (409), changing nothing', async (status) => {
      await seedEvent('other', status);

      const res = await reject(VALID, 'coordinator', 'other').expect(409);

      expect(res.body.message).toBe(`an event that is ${status} cannot be rejected as unfulfillable`);
      const event = await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.other } });
      expect(event).toMatchObject({ status, decisionReason: null });
    });

    it("leaves US-08's review rejection as it was: refused for an event being arranged", async () => {
      const res = await http()
        .post(`/events/${ids.gala}/reject`)
        .set('Authorization', as('coordinator'))
        .send({ reason: 'No.' })
        .expect(409);

      expect(res.body.message).toBe('cannot change status from PLANNING to REJECTED');
      expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.gala } })).status).toBe(
        EventStatus.PLANNING,
      );
    });
  });

  describe('US-47 AC-2: each reason category, with a comment', () => {
    it.each([
      ['NO_SUITABLE_VENUE', 'No suitable venue'],
      ['NO_AVAILABLE_EQUIPMENT', 'No available equipment'],
      ['NO_VENUE_OR_EQUIPMENT', 'No suitable venue or available equipment'],
    ])('records %s', async (reason, label) => {
      const res = await reject({ reason, comment: 'Tried everything.' }).expect(200);

      expect(res.body.decisionReason).toBe(`${label}: Tried everything.`);
      const event = await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.gala } });
      expect(event.decisionReason).toBe(`${label}: Tried everything.`);
    });
  });

  describe('US-47 AC-3: cannot be submitted without a reason', () => {
    it.each([
      ['no reason', { comment: 'x' }, 'a reason is required'],
      ['an unknown reason', { reason: 'TOO_EXPENSIVE', comment: 'x' }, 'a reason is required'],
      ['no comment', { reason: 'NO_SUITABLE_VENUE' }, 'a comment is required to reject this request'],
      ['a blank comment', { reason: 'NO_SUITABLE_VENUE', comment: '  ' }, 'a comment is required to reject this request'],
    ])('400s with %s, and changes and releases nothing', async (_label, body, message) => {
      const res = await reject(body).expect(400);

      expect(res.body.message.join(' ')).toContain(message);
      expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.gala } })).status).toBe(
        EventStatus.PLANNING,
      );
      expect(await prisma.venueBooking.count({ where: { status: BookingStatus.RELEASED } })).toBe(0);
      expect(
        await prisma.equipmentReservation.count({ where: { status: ReservationStatus.RELEASED } }),
      ).toBe(0);
    });
  });

  describe('US-47 AC-5: tentative holds and reservations are released, records kept', () => {
    it("releases the event's pending and approved bookings, keeping them linked", async () => {
      await reject(VALID).expect(200);

      // By id, not creation order: rows seeded in the same millisecond tie on
      // createdAt, so their order would not be stable.
      const bookings = await prisma.venueBooking.findMany({ where: { eventId: ids.gala } });
      const byId = new Map(bookings.map((b) => [b.id, b]));
      expect(bookings).toHaveLength(3);
      expect(byId.get(ids.pendingHold)).toMatchObject({ status: BookingStatus.RELEASED });
      expect(byId.get(ids.approvedBooking)).toMatchObject({ status: BookingStatus.RELEASED });
      // Already rejected: held nothing, so nothing to release.
      expect(byId.get(ids.rejectedRequest)).toMatchObject({
        status: BookingStatus.REJECTED,
        releasedAt: null,
      });
      expect(byId.get(ids.pendingHold)!.releasedAt).not.toBeNull();
      expect(byId.get(ids.approvedBooking)!.releasedAt).not.toBeNull();
    });

    it('releases its equipment reservations through the US-33 release', async () => {
      await reject(VALID).expect(200);

      const reservations = await prisma.equipmentReservation.findMany({ where: { eventId: ids.gala } });
      expect(reservations).toHaveLength(2);
      for (const r of reservations) {
        expect(r.status).toBe(ReservationStatus.RELEASED);
        expect(r.releasedAt).not.toBeNull();
      }
    });

    it('makes the equipment available again in availability checks', async () => {
      const check = () =>
        http()
          .get(`/equipment/${ids.projector}/availability`)
          .query({ start: START, end: END, quantity: 4 })
          .set('Authorization', as('tech'));

      expect((await check().expect(200)).body).toMatchObject({ availableQuantity: 1, fullyAvailable: false });

      await reject(VALID).expect(200);

      expect((await check().expect(200)).body).toMatchObject({ availableQuantity: 4, fullyAvailable: true });
    });

    it('frees the venue: the approved slot can be booked by another event', async () => {
      await reject(VALID).expect(200);
      await seedEvent('next');

      await http()
        .post('/bookings')
        .set('Authorization', as('coordinator'))
        .send({ eventId: ids.next, venueId: ids.hallB, start: START, end: END, expectedAttendance: 50 })
        .expect(201);
    });

    it("never touches another event's bookings or reservations", async () => {
      await seedEvent('bystander');
      await seedBooking('bystanderBooking', 'bystander', 'hallC', BookingStatus.APPROVED);
      await prisma.equipmentReservation.create({
        data: {
          eventId: ids.bystander,
          equipmentId: ids.projector,
          quantity: 1,
          start: new Date('2030-11-01T01:00:00Z'),
          end: new Date('2030-11-01T02:00:00Z'),
          status: ReservationStatus.APPROVED,
        },
      });

      await reject(VALID).expect(200);

      expect(
        (await prisma.venueBooking.findUniqueOrThrow({ where: { id: ids.bystanderBooking } })).status,
      ).toBe(BookingStatus.APPROVED);
      expect(
        await prisma.equipmentReservation.count({
          where: { eventId: ids.bystander, status: ReservationStatus.APPROVED },
        }),
      ).toBe(1);
    });
  });

  describe('US-47 AC-6: the Organiser is notified with the reason and comment', () => {
    it('notifies the Organiser, and only them', async () => {
      await reject({ reason: 'NO_VENUE_OR_EQUIPMENT', comment: 'Nothing fits 120 people.' }).expect(200);

      // US-67 also tells the Coordinator their equipment was released; that is
      // its own notice, not the rejection, so it is set aside here.
      const notices = await prisma.notification.findMany();
      const others = notices.filter((n) => n.type !== NotificationType.EVENT_STATUS_CHANGED);
      expect(others).toEqual(
        others.map(() =>
          expect.objectContaining({
            recipientId: ids.coordinator,
            type: NotificationType.EQUIPMENT_RELEASED,
          }),
        ),
      );

      const rejections = notices.filter((n) => n.type === NotificationType.EVENT_STATUS_CHANGED);
      expect(rejections).toEqual([
        expect.objectContaining({
          recipientId: ids.organiser,
          type: NotificationType.EVENT_STATUS_CHANGED,
          relatedEventId: ids.gala,
          message:
            'Your event request "gala" has been rejected because it cannot be fulfilled. ' +
            'Reason: No suitable venue or available equipment: Nothing fits 120 people.',
        }),
      ]);
    });

    it('shows the Organiser the rejection and its reason on their request', async () => {
      await reject(VALID).expect(200);

      const res = await http()
        .get(`/events/mine/${ids.gala}`)
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body.status).toBe('REJECTED');
      expect(res.body.statusView.decision).toEqual({
        outcome: 'REJECTED',
        reason: 'No suitable venue: Every hall is booked that week.',
      });
    });
  });

  describe('US-47: only the responsible Coordinator can reject', () => {
    it("refuses another Coordinator (404: the event is not theirs to see), changing nothing", async () => {
      await reject(VALID, 'otherCoordinator').expect(404);

      expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.gala } })).status).toBe(
        EventStatus.PLANNING,
      );
      expect(await prisma.notification.count()).toBe(0);
    });

    it.each(['organiser', 'staff', 'tech', 'attendee'])('is refused to %s (403)', async (who) => {
      await reject(VALID, who).expect(403);
    });
  });
});
