import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BookingDecisionKind,
  BookingStatus,
  EventRequest,
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
import { BookingsService } from '../src/bookings/bookings.service';
import { EventsService } from '../src/events/events.service';

/**
 * US-44 e2e — releasing venue bookings when their event is cancelled.
 *
 * The cancel endpoint is US-43's and does not exist yet; every path that
 * cancels goes through EventsService.setStatus(event, CANCELLED), which is
 * what these tests call.
 */
describe('US-44 release venue bookings on event cancellation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const at = (time: string, day = '2030-10-01') => new Date(`${day}T${time}:00Z`);
  const fromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000);

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: key, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  const seedVenue = (name: string, managedById: string) =>
    prisma.venue.create({
      data: { name, location: 'Level 1', capacity: 300, status: VenueStatus.PUBLISHED, managedById },
    });

  const seedEvent = (name = 'Gala') =>
    prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        coordinatorId: ids.coordinator,
        name,
        purpose: 'Celebrate',
        description: 'An evening',
        category: 'Social',
        proposedStart: at('18:00'),
        proposedEnd: at('22:00'),
        expectedAttendance: 120,
        status: EventStatus.PLANNING,
      },
    });

  const seedBooking = (
    eventId: string,
    status: BookingStatus,
    { venueId = ids.hall, start = at('18:00'), end = at('22:00'), needsReview = false } = {},
  ) =>
    prisma.venueBooking.create({
      data: {
        eventId,
        venueId,
        start,
        end,
        status,
        needsReview,
        needsReviewReason: needsReview ? 'Clashes under new buffers.' : null,
        requestedById: ids.coordinator,
        expectedAttendance: 120,
        ...(status === BookingStatus.HELD ? { holdExpiresAt: fromNow(48), heldById: ids.staffA } : {}),
      },
    });

  const cancel = (event: EventRequest, actorId?: string) =>
    app.get(EventsService).setStatus(event, EventStatus.CANCELLED, undefined, actorId);

  const booking = (id: string) => prisma.venueBooking.findUniqueOrThrow({ where: { id } });

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
    jest.restoreAllMocks();
    await prisma.notification.deleteMany();
    await prisma.bookingDecision.deleteMany();
    await prisma.venueBooking.deleteMany();
    await prisma.venueBlock.deleteMany();
    await prisma.venue.deleteMany();
    await prisma.equipmentReservation.deleteMany();
    await prisma.equipment.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();

    await seedUser('staffA', 'staff.a@example.com', Role.VENUE_STAFF);
    await seedUser('staffB', 'staff.b@example.com', Role.VENUE_STAFF);
    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);

    ids.hall = (await seedVenue('Main Hall', ids.staffA)).id;
    ids.annex = (await seedVenue('East Annex', ids.staffB)).id;
  });

  describe('AC-1/AC-3/AC-4: every live booking is released, and kept', () => {
    it('US-44: pending, held and confirmed bookings become RELEASED with the reason and a timestamp; rejected ones are untouched', async () => {
      const event = await seedEvent();
      const pending = await seedBooking(event.id, BookingStatus.REQUESTED, { start: at('09:00'), end: at('10:00') });
      const held = await seedBooking(event.id, BookingStatus.HELD, { start: at('11:00'), end: at('12:00') });
      const confirmed = await seedBooking(event.id, BookingStatus.APPROVED);
      const rejected = await seedBooking(event.id, BookingStatus.REJECTED, { start: at('13:00'), end: at('14:00') });
      const before = new Date();

      await cancel(event);

      for (const b of [pending, held, confirmed]) {
        const after = await booking(b.id);
        expect(after).toMatchObject({ status: BookingStatus.RELEASED, releaseReason: 'Event cancelled' });
        expect(after.releasedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
      }
      expect(await booking(rejected.id)).toMatchObject({ status: BookingStatus.REJECTED, releaseReason: null, releasedAt: null });
      // AC-4: kept, not deleted.
      expect(await prisma.venueBooking.count({ where: { eventId: event.id } })).toBe(4);
    });

    it('US-44: each release is recorded in the booking history, by the system or by the canceller', async () => {
      const event = await seedEvent();
      const a = await seedBooking(event.id, BookingStatus.APPROVED);

      await cancel(event);

      expect(await prisma.bookingDecision.findMany({ where: { bookingId: a.id } })).toEqual([
        expect.objectContaining({
          kind: BookingDecisionKind.RELEASE,
          outcome: BookingStatus.RELEASED,
          reason: 'Event cancelled',
          decidedById: null,
        }),
      ]);

      const other = await seedEvent('Other');
      const b = await seedBooking(other.id, BookingStatus.REQUESTED, { start: at('09:00'), end: at('10:00') });
      await cancel(other, ids.organiser);
      expect((await prisma.bookingDecision.findFirstOrThrow({ where: { bookingId: b.id } })).decidedById).toBe(ids.organiser);
    });

    it('US-44: a booking flagged "Conflict - needs review" is released too, and its flag cleared', async () => {
      const event = await seedEvent();
      const flagged = await seedBooking(event.id, BookingStatus.APPROVED, { needsReview: true });

      await cancel(event);

      expect(await booking(flagged.id)).toMatchObject({ status: BookingStatus.RELEASED, needsReview: false });
    });
  });

  describe('AC-5/AC-6: managers are told; other bookings are not touched', () => {
    it('US-44: an event on two venues releases both, and tells each manager once', async () => {
      const event = await seedEvent();
      const onHall = await seedBooking(event.id, BookingStatus.APPROVED);
      const onAnnex = await seedBooking(event.id, BookingStatus.REQUESTED, { venueId: ids.annex });

      await cancel(event);

      expect((await booking(onHall.id)).status).toBe(BookingStatus.RELEASED);
      expect((await booking(onAnnex.id)).status).toBe(BookingStatus.RELEASED);

      const notices = await prisma.notification.findMany({ orderBy: { recipientId: 'asc' } });
      // One per released booking, to its venue's manager — and no second, US-40 notice.
      expect(notices.map((n) => [n.recipientId, n.type, n.relatedBookingId]).sort()).toEqual(
        [
          [ids.staffA, NotificationType.BOOKING_EVENT_CANCELLED, onHall.id],
          [ids.staffB, NotificationType.BOOKING_EVENT_CANCELLED, onAnnex.id],
        ].sort(),
      );
      expect(notices.find((n) => n.recipientId === ids.staffA)!.message).toMatch(
        /"Gala" has been cancelled\. Its booking of Main Hall for .* has been released\./,
      );
    });

    it("US-44: another event's booking on the same venue is unchanged", async () => {
      const event = await seedEvent();
      const other = await seedEvent('Other');
      await seedBooking(event.id, BookingStatus.APPROVED);
      const neighbour = await seedBooking(other.id, BookingStatus.APPROVED, { start: at('08:00'), end: at('12:00') });

      await cancel(event);

      expect(await booking(neighbour.id)).toMatchObject({ status: BookingStatus.APPROVED, releasedAt: null });
    });
  });

  describe('AC-2: the slot is available straight away', () => {
    it('US-44: calendar, availability and search show it free, and a new request for it succeeds and can be approved', async () => {
      const event = await seedEvent();
      await seedBooking(event.id, BookingStatus.APPROVED);
      const next = await seedEvent('Next');

      await cancel(event);

      const calendar = await http()
        .get(`/calendar?from=${at('00:00').toISOString()}&to=${at('00:00', '2030-10-03').toISOString()}`)
        .set('Authorization', as('staffA'))
        .expect(200);
      expect(calendar.body.entries).toEqual([]);

      const days = await http()
        .get(`/venues/${ids.hall}/availability?from=2030-10-01&to=2030-10-02`)
        .set('Authorization', as('coordinator'))
        .expect(200);
      expect(days.body.map((d: { status: string }) => d.status)).toEqual(['free', 'free']);

      const search = await http()
        .get(`/venues/search?from=${at('18:00').toISOString()}&to=${at('22:00').toISOString()}`)
        .set('Authorization', as('coordinator'))
        .expect(200);
      expect(search.body.map((v: { name: string }) => v.name)).toContain('Main Hall');

      const req = await http()
        .post('/bookings')
        .set('Authorization', as('coordinator'))
        .send({ eventId: next.id, venueId: ids.hall, start: at('18:00'), end: at('22:00'), expectedAttendance: 120 })
        .expect(201);
      expect(req.body.warnings).toEqual([]);
      await http().post(`/bookings/${req.body.id}/approve`).set('Authorization', as('staffA')).send({}).expect(200);
    });

    it('US-44: the release shows in the Venue Staff queue history as Released', async () => {
      const event = await seedEvent();
      const released = await seedBooking(event.id, BookingStatus.APPROVED);

      await cancel(event);

      const decided = await http().get('/bookings/queue?view=decided').set('Authorization', as('staffA')).expect(200);
      expect(decided.body.map((b: { id: string; status: string }) => [b.id, b.status])).toEqual([
        [released.id, BookingStatus.RELEASED],
      ]);
      const filtered = await http()
        .get('/bookings/queue?view=decided&status=RELEASED')
        .set('Authorization', as('staffA'))
        .expect(200);
      expect(filtered.body).toHaveLength(1);
    });
  });

  describe('US-33 and US-51 alongside', () => {
    it("US-44: the event's equipment is still released (US-33)", async () => {
      const event = await seedEvent();
      await seedBooking(event.id, BookingStatus.APPROVED);
      const mic = await prisma.equipment.create({ data: { type: 'Wireless microphone', totalQuantity: 10 } });
      const reservation = await prisma.equipmentReservation.create({
        data: { eventId: event.id, equipmentId: mic.id, quantity: 2, start: at('18:00'), end: at('22:00'), status: ReservationStatus.APPROVED },
      });

      await cancel(event);

      expect((await prisma.equipmentReservation.findUniqueOrThrow({ where: { id: reservation.id } })).status).toBe(
        ReservationStatus.RELEASED,
      );
    });

    it("US-44: releasing one of a clashing pair clears the other's review flag (US-51)", async () => {
      await prisma.venue.update({ where: { id: ids.hall }, data: { setupMinutes: 30, turnaroundMinutes: 30 } });
      const event = await seedEvent();
      const other = await seedEvent('Other');
      await seedBooking(event.id, BookingStatus.APPROVED, { start: at('10:00'), end: at('12:00'), needsReview: true });
      const partner = await seedBooking(other.id, BookingStatus.APPROVED, { start: at('12:30'), end: at('14:00'), needsReview: true });

      await cancel(event);

      expect(await booking(partner.id)).toMatchObject({ status: BookingStatus.APPROVED, needsReview: false });
    });
  });

  describe('Rollback', () => {
    it('US-44: if the release fails, the event is not cancelled and nothing is released or sent', async () => {
      const event = await seedEvent();
      const approved = await seedBooking(event.id, BookingStatus.APPROVED);
      const mic = await prisma.equipment.create({ data: { type: 'Wireless microphone', totalQuantity: 10 } });
      const reservation = await prisma.equipmentReservation.create({
        data: { eventId: event.id, equipmentId: mic.id, quantity: 2, start: at('18:00'), end: at('22:00'), status: ReservationStatus.APPROVED },
      });
      const bookings = app.get(BookingsService);
      const original = bookings.releaseForCancelledEvent.bind(bookings);
      jest.spyOn(bookings, 'releaseForCancelledEvent').mockImplementation(async (...args) => {
        await original(...args);
        throw new Error('release failed');
      });

      await expect(cancel(event)).rejects.toThrow('release failed');

      expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(EventStatus.PLANNING);
      expect((await booking(approved.id)).status).toBe(BookingStatus.APPROVED);
      expect((await prisma.equipmentReservation.findUniqueOrThrow({ where: { id: reservation.id } })).status).toBe(
        ReservationStatus.APPROVED,
      );
      expect(await prisma.bookingDecision.count()).toBe(0);
      expect(await prisma.notification.count()).toBe(0);
    });
  });
});
