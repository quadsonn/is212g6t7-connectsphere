import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, NotificationType, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { VenueActivityNotifier } from '../src/bookings/venue-activity-notifier';
import { configureApp } from '../src/configure-app';
import { EventsService } from '../src/events/events.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-40 e2e — venue activity notifications for Venue Staff.
 *
 * Each trigger is driven through the path that really fires it (HTTP where an
 * endpoint exists; EventsService.setStatus for cancellation, which has no
 * endpoint on this branch yet), and read back through GET /notifications, so
 * the recipient scoping is proved end to end.
 *
 * Pre-condition for every test: reset the testDB, then run base-users.sql,
 * base-venues.sql and tc-s3-54-setup.sql (a second Venue Staff member, USR-016,
 * managing East Annex; Old Gym with no manager; the "Gala", EVT-194). Each
 * test then loads the tc-s3 script its test case names (see
 * docs/testing/sprint3-test-cases.md).
 */
describe('US-40 venue activity notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  /** Fixed rows from base-users, base-venues and tc-s3-54-setup. */
  const ids: Record<string, string> = {
    staffA: 'USR-010',
    staffB: 'USR-016',
    organiser: 'USR-006',
    coordinator: 'USR-004',
    hall: 'VEN-002',
    annex: 'VEN-039',
  };
  const LOGINS: Record<string, string> = {
    staffA: 'venue.staff@example.com',
    staffB: 'sam.staff@example.com',
    organiser: 'organiser@example.com',
    coordinator: 'coord.a@example.com',
  };

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const inbox = (who: string, query = '') =>
    http().get(`/notifications${query}`).set('Authorization', as(who));

  /** Far enough ahead that every "in the future" check passes. */
  const at = (time: string, day = '2030-10-01') => new Date(`${day}T${time}:00Z`);

  /** Loads a test case's setup script(s) on top of the base scripts. */
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  /** The "Gala" (EVT-194) as stored, for EventsService.setStatus. */
  const seedEvent = () => prisma.eventRequest.findUniqueOrThrow({ where: { id: 'EVT-194' } });
  const seedBooking = (id: string) => prisma.venueBooking.findUniqueOrThrow({ where: { id } });

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
    configureApp(app);
    await app.listen(0, '127.0.0.1');

    prisma = new PrismaClient();

    // Users keep their fixed IDs after every reset, so these tokens stay valid.
    await resetDb(prisma);
    await loadSql(prisma, 'base-users');
    await loadSql(prisma, 'tc-s3-54-setup');
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
    jest.restoreAllMocks();
    await resetDb(prisma);
    await loadSql(prisma, 'base-users');
    await loadSql(prisma, 'base-venues');
    await loadSql(prisma, 'tc-s3-54-setup');
  });

  describe('AC-1/AC-2/AC-3: a booking request is submitted', () => {
    // TC-S3-54, TC-S3-58, TC-S3-59, TC-S3-62 · US-40 AC-1/2/3/6 · setup: base-users + base-venues + tc-s3-54-setup · fails if a new booking request notifies no one, notifies another venue's staff, or omits the venue, event, time or link
    // Code: BookingsService.request -> VenueActivityNotifier.requestSubmitted; NotificationsInboxService.list
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

    // TC-S3-58 · US-40 AC-2 · setup: base-users + base-venues + tc-s3-54-setup · fails if a request for an unmanaged venue notifies someone
    // Code: VenueActivityNotifier sends only to the venue's managedById
    it('US-40: a venue with no manager notifies no one', async () => {
      const orphan = { id: 'VEN-040' }; // Old Gym, managed by nobody
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
    // TC-S3-55 · US-40 AC-1 · setup: base-users + base-venues + tc-s3-54-setup + tc-s3-55-setup · fails if moving an approved booking's date or time does not tell its manager
    // Code: EventsChangeReviewService.approve -> VenueActivityNotifier.bookingChanged
    it('US-40: a new date and time notifies the manager once per approved booking', async () => {
      await given('tc-s3-55-setup');
      const event = await seedEvent();
      const booking = await seedBooking('BKG-079');

      await approveChange(event.id, {
        proposedStart: at('18:00', '2030-10-08'),
        proposedEnd: at('22:00', '2030-10-08'),
      });

      // US-48 AC-7: the booking is rebooked for the new time and keeps its
      // approval, so the notice names the new booking the manager now holds.
      const { replacedByBookingId } = await prisma.venueBooking.findUniqueOrThrow({
        where: { id: booking.id },
      });
      const all = await ofType(NotificationType.BOOKING_DETAILS_CHANGED);
      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({
        recipientId: ids.staffA,
        relatedBookingId: replacedByBookingId,
        relatedEventId: event.id,
      });
      expect(all[0].message).toBe(
        'Time 1 Oct 2030, 18:00–22:00 UTC → 8 Oct 2030, 18:00–22:00 UTC. The approval carries over; no new decision is needed.',
      );
    });

    // TC-S3-55 · US-40 AC-1 · setup: base-users + base-venues + tc-s3-54-setup + tc-s3-55-setup · fails if an attendance change on an approved booking does not tell its manager
    // Code: EventsChangeReviewService.approve -> VenueActivityNotifier.bookingChanged
    it('US-40: an attendance change notifies the manager', async () => {
      await given('tc-s3-55-setup');
      const event = await seedEvent();
      const booking = await seedBooking('BKG-079');

      await approveChange(event.id, { proposedAttendance: 200 });

      const all = await ofType(NotificationType.BOOKING_DETAILS_CHANGED);
      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({ recipientId: ids.staffA, relatedBookingId: booking.id });
      expect(all[0].message).toBe('Attendance 120 → 200.');
    });

    // TC-S3-55 · US-40 AC-1 · setup: base-users + base-venues + tc-s3-54-setup + tc-s3-55b-setup · fails if a change to a booking that is not approved is reported
    // Code: VenueActivityNotifier.bookingChanged is called only for APPROVED bookings
    it('US-40: a booking that was not APPROVED is not reported as changed', async () => {
      await given('tc-s3-55b-setup');
      const event = await seedEvent();

      await approveChange(event.id, { proposedAttendance: 200 });

      expect(await ofType(NotificationType.BOOKING_DETAILS_CHANGED)).toHaveLength(0);
    });
  });

  describe('AC-1/AC-2: an event using the venue is cancelled', () => {
    // TC-S3-56, TC-S3-58 · US-40 AC-1/AC-2 · setup: base-users + base-venues + tc-s3-54-setup + tc-s3-55-setup + tc-s3-56-setup · fails if cancelling an event does not tell the manager of its live booking, or tells the manager of a rejected one
    // Code: EventsService.setStatus(CANCELLED) -> VenueActivityNotifier.eventCancelled
    it('US-40: notifies the manager of each venue with a live booking, and no one else', async () => {
      await given('tc-s3-55-setup', 'tc-s3-56-setup');
      const event = await seedEvent();
      const live = await seedBooking('BKG-079');

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
    // TC-S3-57 · US-40 AC-1 · setup: base-users + base-venues + tc-s3-54-setup + tc-s3-55b-setup · fails if a hold about to expire or expired does not tell the venue's manager
    // Code: VenueActivityNotifier.holdExpiring / holdExpired
    it('US-40: the hold helpers notify the venue manager', async () => {
      await given('tc-s3-55b-setup');
      const hold = await seedBooking('BKG-080');
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
    // TC-S3-61 · US-40 AC-5 · setup: base-users + base-venues + tc-s3-54-setup + tc-s3-61-setup · fails if the feed is not newest first, or a page repeats or skips one
    // Code: NotificationsInboxService.list orders by createdAt desc, cursor paging
    it('US-40: newest first, paginated with a cursor', async () => {
      await given('tc-s3-61-setup'); // m1 (newest) to m5, for staffA

      const first = (await inbox('staffA', '?limit=2').expect(200)).body;
      expect(first.map((n: { message: string }) => n.message)).toEqual(['m1', 'm2']);

      const next = (await inbox('staffA', `?limit=2&cursor=${first[1].id}`).expect(200)).body;
      expect(next.map((n: { message: string }) => n.message)).toEqual(['m3', 'm4']);

      const last = (await inbox('staffA', `?limit=2&cursor=${next[1].id}`).expect(200)).body;
      expect(last.map((n: { message: string }) => n.message)).toEqual(['m5']);
    });

    // TC-S3-61 · US-40 AC-5 · setup: base-users + base-venues + tc-s3-54-setup + tc-s3-60-setup · fails if someone else's notification can be used as a paging cursor
    // Code: NotificationsInboxService.list checks the cursor is the caller's own
    it("US-40: refuses another user's notification as the paging cursor (404)", async () => {
      await given('tc-s3-60-setup'); // NTF-010 is staffB's

      await inbox('staffA', '?limit=2&cursor=NTF-010').expect(404);
    });

    // TC-S3-61 · US-40 AC-5 · setup: base-users + base-venues + tc-s3-54-setup · fails if a page size outside 1-100 is accepted
    // Code: ListNotificationsDto limit @Min(1) @Max(100)
    it('US-40: rejects a limit outside 1–100', async () => {
      await inbox('staffA', '?limit=0').expect(400);
      await inbox('staffA', '?limit=101').expect(400);
    });

    // TC-S3-60 · US-40 AC-4 · setup: base-users + base-venues + tc-s3-54-setup + tc-s3-60-setup · fails if the unread count is wrong, marking one or all does not lower it, or a user can mark someone else's
    // Code: NotificationsInboxService.unreadCount / markRead / markAllRead
    it("US-40: unread count, mark one, mark all — and never someone else's", async () => {
      await given('tc-s3-60-setup');
      const a1 = 'NTF-008'; // staffA's "m3"; staffA also has "m2"
      const b1 = 'NTF-010'; // staffB's "m1"

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
    // TC-S3-62 · US-40 AC-6 · setup: base-users + base-venues + tc-s3-54-setup · fails if a booking submission that fails still leaves a notification
    // Code: BookingsService.request records the notice in the submission's transaction
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

    // TC-S3-62 · US-40 AC-6 · setup: base-users + base-venues + tc-s3-54-setup + tc-s3-55-setup · fails if a cancellation that rolls back still leaves a notification
    // Code: EventsService.setStatus records the notice in the cancellation's transaction
    it('US-40: a cancellation rolled back leaves no notification', async () => {
      await given('tc-s3-55-setup');
      const event = await seedEvent();

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
