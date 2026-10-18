import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BookingStatus,
  EventStatus,
  NotificationType,
  PrismaClient,
  Role,
  VenueStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { VenueActivityNotifier } from '../src/bookings/venue-activity-notifier';
import { EventsService } from '../src/events/events.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * US-40 e2e — venue activity notifications for Venue Staff.
 *
 * Each trigger is driven through the path that really fires it (HTTP where an
 * endpoint exists; EventsService.setStatus for cancellation, which has no
 * endpoint on this branch yet), and read back through GET /notifications, so
 * the recipient scoping is proved end to end.
 */
describe('US-40 venue activity notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const inbox = (who: string, query = '') =>
    http().get(`/notifications${query}`).set('Authorization', as(who));

  /** Far enough ahead that every "in the future" check passes. */
  const at = (time: string, day = '2030-10-01') => new Date(`${day}T${time}:00Z`);

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: key, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  const seedVenue = (name: string, managedById: string | null) =>
    prisma.venue.create({
      data: { name, location: 'Level 1', capacity: 300, status: VenueStatus.PUBLISHED, managedById },
    });

  const seedEvent = (name = 'Gala', status: EventStatus = EventStatus.PLANNING) =>
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
        status,
      },
    });

  const seedBooking = (eventId: string, venueId: string, status: BookingStatus) =>
    prisma.venueBooking.create({
      data: {
        eventId,
        venueId,
        start: at('18:00'),
        end: at('22:00'),
        status,
        requestedById: ids.coordinator,
        expectedAttendance: 120,
      },
    });

  /** The Organiser proposes a change; the Coordinator approves it (US-37/US-48). */
  const approveChange = async (eventId: string, change: object) => {
    const created = await http()
      .post(`/events/${eventId}/change-requests`)
      .set('Authorization', as('organiser'))
      .send({ reason: 'Plans changed', ...change })
      .expect(201);
    await http()
      .post(`/events/change-requests/${created.body.id}/approve`)
      .set('Authorization', as('coordinator'))
      .expect(200);
  };

  const ofType = (type: NotificationType) => prisma.notification.findMany({ where: { type } });

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

  describe('AC-1/AC-2/AC-3: a booking request is submitted', () => {
    it('US-40: notifies only the venue manager, with venue, event, what happened, when and a link', async () => {
      const event = await seedEvent();

      const res = await http()
        .post('/bookings')
        .set('Authorization', as('coordinator'))
        .send({
          eventId: event.id,
          venueId: ids.hall,
          start: at('18:00'),
          end: at('22:00'),
          expectedAttendance: 120,
        })
        .expect(201);

      const all = await ofType(NotificationType.BOOKING_REQUEST_SUBMITTED);
      expect(all).toHaveLength(1);
      expect(all[0].recipientId).toBe(ids.staffA);

      const mine = (await inbox('staffA').expect(200)).body;
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({
        type: NotificationType.BOOKING_REQUEST_SUBMITTED,
        read: false,
        relatedEvent: { id: event.id, name: 'Gala' },
        relatedBooking: { id: res.body.id, venue: { id: ids.hall, name: 'Main Hall' } },
        link: `/venues/bookings/${res.body.id}`,
      });
      // AC-3: venue and event come with it (above); the message says when.
      expect(mine[0].summary).toBe('Requested for 1 Oct 2030, 18:00–22:00 UTC.');
      expect(typeof mine[0].createdAt).toBe('string');

      expect((await inbox('staffB').expect(200)).body).toEqual([]);
    });

    it('US-40: a venue with no manager notifies no one', async () => {
      const orphan = await seedVenue('Old Gym', null);
      const event = await seedEvent();

      await http()
        .post('/bookings')
        .set('Authorization', as('coordinator'))
        .send({ eventId: event.id, venueId: orphan.id, start: at('18:00'), end: at('22:00'), expectedAttendance: 120 })
        .expect(201);

      expect(await prisma.notification.count()).toBe(0);
    });
  });

  describe("AC-1: an APPROVED booking's date, time or attendance changes", () => {
    it('US-40: a new date and time notifies the manager once per approved booking', async () => {
      const event = await seedEvent();
      const booking = await seedBooking(event.id, ids.hall, BookingStatus.APPROVED);

      await approveChange(event.id, {
        proposedStart: at('18:00', '2030-10-08'),
        proposedEnd: at('22:00', '2030-10-08'),
      });

      const all = await ofType(NotificationType.BOOKING_DETAILS_CHANGED);
      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({ recipientId: ids.staffA, relatedBookingId: booking.id, relatedEventId: event.id });
      expect(all[0].message).toBe(
        'Time 1 Oct 2030, 18:00–22:00 UTC → 8 Oct 2030, 18:00–22:00 UTC. Back in your queue for a new decision.',
      );
    });

    it('US-40: an attendance change notifies the manager', async () => {
      const event = await seedEvent();
      const booking = await seedBooking(event.id, ids.hall, BookingStatus.APPROVED);

      await approveChange(event.id, { proposedAttendance: 200 });

      const all = await ofType(NotificationType.BOOKING_DETAILS_CHANGED);
      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({ recipientId: ids.staffA, relatedBookingId: booking.id });
      expect(all[0].message).toBe('Attendance 120 → 200.');
    });

    it('US-40: a booking that was not APPROVED is not reported as changed', async () => {
      const event = await seedEvent();
      await seedBooking(event.id, ids.hall, BookingStatus.REQUESTED);

      await approveChange(event.id, { proposedAttendance: 200 });

      expect(await ofType(NotificationType.BOOKING_DETAILS_CHANGED)).toHaveLength(0);
    });
  });

  describe('AC-1/AC-2: an event using the venue is cancelled', () => {
    it('US-40: notifies the manager of each venue with a live booking, and no one else', async () => {
      const event = await seedEvent();
      const live = await seedBooking(event.id, ids.hall, BookingStatus.APPROVED);
      await seedBooking(event.id, ids.annex, BookingStatus.REJECTED);

      await app.get(EventsService).setStatus(event, EventStatus.CANCELLED);

      const all = await ofType(NotificationType.BOOKING_EVENT_CANCELLED);
      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({ recipientId: ids.staffA, relatedBookingId: live.id });
      expect(all[0]).toMatchObject({ relatedEventId: event.id });
      expect(all[0].message).toBe('Booking for 1 Oct 2030, 18:00–22:00 UTC released.');
      expect((await inbox('staffB').expect(200)).body).toEqual([]);
    });
  });

  describe('AC-1: tentative holds (helper for US-54)', () => {
    it('US-40: the hold helpers notify the venue manager', async () => {
      const event = await seedEvent();
      const hold = await seedBooking(event.id, ids.hall, BookingStatus.REQUESTED);
      const notifier = app.get(VenueActivityNotifier);
      const tx = app.get(PrismaService);

      await notifier.holdExpiring(tx, hold.id, at('12:00', '2030-09-30'));
      await notifier.holdExpired(tx, hold.id);

      const mine = await prisma.notification.findMany({
        where: { recipientId: ids.staffA },
        orderBy: { createdAt: 'asc' },
      });
      expect(mine.map((n) => n.type)).toEqual([NotificationType.HOLD_EXPIRING, NotificationType.HOLD_EXPIRED]);
      expect(mine[0].message).toContain('expires 30 Sep 2030, 12:00 UTC');
      expect(mine.every((n) => n.relatedBookingId === hold.id)).toBe(true);
      expect(await prisma.notification.count({ where: { recipientId: ids.staffB } })).toBe(0);
    });
  });

  describe('AC-4/AC-5: reading the feed', () => {
    const insert = async (who: string, minutesAgo: number) =>
      (
        await prisma.notification.create({
          data: {
            recipientId: ids[who],
            type: NotificationType.BOOKING_REQUEST_SUBMITTED,
            message: `m${minutesAgo}`,
            createdAt: new Date(Date.now() - minutesAgo * 60_000),
          },
        })
      ).id;

    it('US-40: newest first, paginated with a cursor', async () => {
      for (const m of [5, 1, 4, 2, 3]) await insert('staffA', m);

      const first = (await inbox('staffA', '?limit=2').expect(200)).body;
      expect(first.map((n: { message: string }) => n.message)).toEqual(['m1', 'm2']);

      const next = (await inbox('staffA', `?limit=2&cursor=${first[1].id}`).expect(200)).body;
      expect(next.map((n: { message: string }) => n.message)).toEqual(['m3', 'm4']);

      const last = (await inbox('staffA', `?limit=2&cursor=${next[1].id}`).expect(200)).body;
      expect(last.map((n: { message: string }) => n.message)).toEqual(['m5']);
    });

    it('US-40: rejects a limit outside 1–100', async () => {
      await inbox('staffA', '?limit=0').expect(400);
      await inbox('staffA', '?limit=101').expect(400);
    });

    it("US-40: unread count, mark one, mark all — and never someone else's", async () => {
      const a1 = await insert('staffA', 3);
      await insert('staffA', 2);
      const b1 = await insert('staffB', 1);

      const count = async (who: string) =>
        (await http().get('/notifications/unread-count').set('Authorization', as(who)).expect(200)).body.unread;

      expect(await count('staffA')).toBe(2);

      await http().patch(`/notifications/${a1}/read`).set('Authorization', as('staffA')).expect(200);
      expect(await count('staffA')).toBe(1);

      await http().patch(`/notifications/${b1}/read`).set('Authorization', as('staffA')).expect(404);
      expect(await count('staffB')).toBe(1);

      await http().patch('/notifications/read-all').set('Authorization', as('staffA')).expect(200);
      expect(await count('staffA')).toBe(0);
      expect(await count('staffB')).toBe(1);
    });
  });

  describe('Rollback: no notification without the action', () => {
    it('US-40: a failed booking submission leaves no notification', async () => {
      const event = await seedEvent();
      const notifier = app.get(VenueActivityNotifier);
      const original = notifier.requestSubmitted.bind(notifier);
      jest.spyOn(notifier, 'requestSubmitted').mockImplementation(async (...args) => {
        await original(...args);
        throw new Error('failure after notifying');
      });

      await http()
        .post('/bookings')
        .set('Authorization', as('coordinator'))
        .send({ eventId: event.id, venueId: ids.hall, start: at('18:00'), end: at('22:00'), expectedAttendance: 120 })
        .expect(500);

      expect(await prisma.venueBooking.count()).toBe(0);
      expect(await prisma.notification.count()).toBe(0);
    });

    it('US-40: a cancellation rolled back leaves no notification', async () => {
      const event = await seedEvent();
      await seedBooking(event.id, ids.hall, BookingStatus.APPROVED);

      await expect(
        app.get(PrismaService).$transaction(async (tx) => {
          await app.get(EventsService).setStatus(event, EventStatus.CANCELLED, tx);
          throw new Error('failure after cancelling');
        }),
      ).rejects.toThrow('failure after cancelling');

      expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(
        EventStatus.PLANNING,
      );
      expect(await prisma.notification.count()).toBe(0);
    });
  });
});
