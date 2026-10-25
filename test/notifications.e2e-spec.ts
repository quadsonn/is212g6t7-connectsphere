import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, NotificationType, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { listenOnLoopback } from './listen-on-loopback';

/**
 * Notifications page e2e — a user reads and marks their own notifications.
 *
 * Notification rows are inserted directly, with the exact message text each
 * story sends, so this suite depends on nothing but the inbox itself: it
 * proves the page shows what US-52, US-47, US-48 and US-41 record. Each of
 * those stories' own suites proves it actually sends its notification.
 *
 * The types used all exist on the shared base; the page does not display the
 * type, so the story-specific types (VENUE_UNAVAILABLE, CHANGE_REQUEST_DECIDED)
 * are not needed here.
 */
describe('Notifications page (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const inbox = (who: string) => http().get('/notifications').set('Authorization', as(who));
  const unread = (who: string) =>
    http().get('/notifications/unread-count').set('Authorization', as(who));
  const markRead = (id: string, who: string) =>
    http().patch(`/notifications/${id}/read`).set('Authorization', as(who));
  const markUnread = (id: string, who: string) =>
    http().patch(`/notifications/${id}/unread`).set('Authorization', as(who));
  const markAll = (who: string) =>
    http().patch('/notifications/read-all').set('Authorization', as(who));

  /** The messages the stories send, word for word. */
  const MESSAGES = {
    // US-52 AC-1 (VenueUnavailabilityService) → the event's Coordinator.
    venueUnavailable:
      'Main Hall is unavailable from 2030-09-30T00:00:00.000Z to 2030-10-02T00:00:00.000Z, affecting the booking for "gala" on 2030-10-01T01:00:00.000Z – 2030-10-01T05:00:00.000Z. Reason: Flood damage. The event has not been cancelled; request a replacement venue.',
    // US-47 AC-6 (EventsUnfulfillableService) → the Organiser.
    unfulfillable:
      'Your event request "gala" has been rejected because it cannot be fulfilled. Reason: No suitable venue: Every hall is booked.',
    // US-48 AC-9 (EventsChangeReviewService) → the Organiser.
    changeRejected: 'Your change request for "gala" was rejected. Reason: The hall seats 50.',
    // US-41 (BookingsService.notifyDecision) → the requesting Coordinator.
    bookingRejected:
      'the booking of Main Hall for "gala" was rejected. Reason: Closed for repairs. Alternative venues suggested: East Hall.',
  };

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: key, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  /** A notification for `who` about the gala, at a fixed time (for ordering). */
  const notify = async (
    who: string,
    type: NotificationType,
    message: string,
    createdAt = new Date(),
  ) =>
    (
      await prisma.notification.create({
        data: { recipientId: ids[who], type, message, relatedEventId: ids.gala, createdAt },
      })
    ).id;

  const clear = async () => {
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

    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);
    await seedUser('otherCoordinator', 'other@example.com', Role.EVENT_COORDINATOR);
    await seedUser('staff', 'staff@example.com', Role.VENUE_STAFF);
    await seedUser('tech', 'tech@example.com', Role.TECHNICAL_SUPPORT_STAFF);
    await seedUser('attendee', 'attendee@example.com', Role.ATTENDEE);
    await seedUser('lead', 'lead@example.com', Role.EVENT_COORDINATOR_LEAD);
    await seedUser('safety', 'safety@example.com', Role.SAFETY_OFFICER);

    ids.gala = (
      await prisma.eventRequest.create({
        data: {
          organiserId: ids.organiser,
          coordinatorId: ids.coordinator,
          name: 'gala',
          purpose: 'p',
          description: 'd',
          category: 'c',
          proposedStart: new Date('2030-10-01T01:00:00.000Z'),
          proposedEnd: new Date('2030-10-01T05:00:00.000Z'),
          expectedAttendance: 50,
          status: EventStatus.PLANNING,
        },
      })
    ).id;
  });

  describe('US-52 AC-1: the Coordinator sees that a booked venue became unavailable, with the reason', () => {
    it('shows the notification, its reason, the event and a link to it', async () => {
      await notify('coordinator', NotificationType.VENUE_CHANGED_BOOKINGS_AFFECTED, MESSAGES.venueUnavailable);

      const { body } = await inbox('coordinator').expect(200);

      expect(body).toEqual([
        {
          id: expect.any(String),
          type: NotificationType.VENUE_CHANGED_BOOKINGS_AFFECTED,
          message: MESSAGES.venueUnavailable,
          summary: expect.stringMatching(/^Main Hall is unavailable from .* affecting the booking for "gala"/),
          reason: 'Flood damage. The event has not been cancelled; request a replacement venue.',
          read: false,
          readAt: null,
          createdAt: expect.any(String),
          // The event's status also comes back (it decides an Attendee's link).
          relatedEvent: expect.objectContaining({ id: ids.gala, name: 'gala' }),
          // US-40: only venue activity names a booking.
          relatedBooking: null,
          link: `/coordinator/events/${ids.gala}`,
        },
      ]);
    });
  });

  describe('US-47 AC-6 / US-48 AC-9: the Organiser sees rejections and change request outcomes, with reasons', () => {
    it('US-47 AC-6: shows the unfulfillable rejection with its reason and comment', async () => {
      await notify('organiser', NotificationType.EVENT_STATUS_CHANGED, MESSAGES.unfulfillable);

      const [item] = (await inbox('organiser').expect(200)).body;

      expect(item).toMatchObject({
        type: NotificationType.EVENT_STATUS_CHANGED,
        summary: 'Your event request "gala" has been rejected because it cannot be fulfilled.',
        reason: 'No suitable venue: Every hall is booked.',
        relatedEvent: { id: ids.gala, name: 'gala' },
        link: `/organiser/${ids.gala}`,
      });
    });

    it('US-48 AC-9: shows the change request outcome with the reason', async () => {
      await notify('organiser', NotificationType.EVENT_CHANGE_REQUESTED, MESSAGES.changeRejected);

      const [item] = (await inbox('organiser').expect(200)).body;

      expect(item).toMatchObject({
        summary: 'Your change request for "gala" was rejected.',
        reason: 'The hall seats 50.',
        link: `/organiser/${ids.gala}`,
      });
    });

    it('US-41: the Coordinator sees a rejection with its suggested alternatives', async () => {
      await notify('coordinator', NotificationType.VENUE_BOOKING_DECIDED, MESSAGES.bookingRejected);

      const [item] = (await inbox('coordinator').expect(200)).body;

      expect(item).toMatchObject({
        type: NotificationType.VENUE_BOOKING_DECIDED,
        reason: 'Closed for repairs. Alternative venues suggested: East Hall.',
        link: `/coordinator/events/${ids.gala}`,
      });
    });
  });

  describe('each user sees only their own notifications', () => {
    it('lists only the caller’s, newest first', async () => {
      await notify('organiser', NotificationType.EVENT_CHANGE_REQUESTED, MESSAGES.changeRejected, new Date('2030-01-01T10:00:00Z'));
      await notify('coordinator', NotificationType.VENUE_CHANGED_BOOKINGS_AFFECTED, MESSAGES.venueUnavailable, new Date('2030-01-01T11:00:00Z'));
      await notify('organiser', NotificationType.EVENT_STATUS_CHANGED, MESSAGES.unfulfillable, new Date('2030-01-01T12:00:00Z'));

      const organiser = (await inbox('organiser').expect(200)).body;
      expect(organiser.map((n: { message: string }) => n.message)).toEqual([
        MESSAGES.unfulfillable,
        MESSAGES.changeRejected,
      ]);

      const coordinator = (await inbox('coordinator').expect(200)).body;
      expect(coordinator.map((n: { message: string }) => n.message)).toEqual([MESSAGES.venueUnavailable]);

      await inbox('otherCoordinator').expect(200).expect([]);
    });

    it('refuses to mark another user’s notification (404), and leaves it unread', async () => {
      const mine = await notify('organiser', NotificationType.EVENT_CHANGE_REQUESTED, MESSAGES.changeRejected);

      await markRead(mine, 'coordinator').expect(404);
      await markRead('no-such-notification', 'organiser').expect(404);

      const stored = await prisma.notification.findUniqueOrThrow({ where: { id: mine } });
      expect(stored).toMatchObject({ read: false, readAt: null });
    });
  });

  describe('unread count and marking read', () => {
    it('updates the count after marking one read, then all', async () => {
      await notify('organiser', NotificationType.EVENT_CHANGE_REQUESTED, MESSAGES.changeRejected, new Date('2030-01-01T10:00:00Z'));
      await notify('organiser', NotificationType.EVENT_STATUS_CHANGED, MESSAGES.unfulfillable, new Date('2030-01-01T11:00:00Z'));
      await notify('organiser', NotificationType.EVENT_STATUS_CHANGED, 'Another update.', new Date('2030-01-01T12:00:00Z'));
      await unread('organiser').expect(200).expect({ unread: 3 });

      const [newest] = (await inbox('organiser').expect(200)).body;
      const marked = await markRead(newest.id, 'organiser').expect(200);
      expect(marked.body).toMatchObject({ id: newest.id, read: true, readAt: expect.any(String) });
      await unread('organiser').expect(200).expect({ unread: 2 });

      await markAll('organiser').expect(200).expect({ marked: 2 });
      await unread('organiser').expect(200).expect({ unread: 0 });
      const after = (await inbox('organiser').expect(200)).body;
      expect(after.every((n: { read: boolean }) => n.read)).toBe(true);
    });

    it('marks one unread again: it counts again and its read time is cleared', async () => {
      const id = await notify('organiser', NotificationType.EVENT_CHANGE_REQUESTED, MESSAGES.changeRejected);
      await markRead(id, 'organiser').expect(200);
      await unread('organiser').expect(200).expect({ unread: 0 });

      const res = await markUnread(id, 'organiser').expect(200);

      expect(res.body).toMatchObject({ id, read: false, readAt: null });
      await unread('organiser').expect(200).expect({ unread: 1 });
    });

    it('refuses to mark another user’s notification unread (404), leaving it read', async () => {
      const id = await notify('organiser', NotificationType.EVENT_CHANGE_REQUESTED, MESSAGES.changeRejected);
      await markRead(id, 'organiser').expect(200);

      await markUnread(id, 'coordinator').expect(404);

      const stored = await prisma.notification.findUniqueOrThrow({ where: { id } });
      expect(stored.read).toBe(true);
    });

    it('marking one read twice keeps its first read time', async () => {
      const id = await notify('organiser', NotificationType.EVENT_CHANGE_REQUESTED, MESSAGES.changeRejected);

      const first = (await markRead(id, 'organiser').expect(200)).body.readAt;
      const second = (await markRead(id, 'organiser').expect(200)).body.readAt;

      expect(second).toBe(first);
    });

    it('mark all read touches only the caller’s notifications', async () => {
      await notify('organiser', NotificationType.EVENT_CHANGE_REQUESTED, MESSAGES.changeRejected);
      await notify('coordinator', NotificationType.VENUE_CHANGED_BOOKINGS_AFFECTED, MESSAGES.venueUnavailable);

      await markAll('organiser').expect(200);

      await unread('coordinator').expect(200).expect({ unread: 1 });
    });
  });

  describe('role access', () => {
    it.each(['organiser', 'coordinator', 'staff', 'tech', 'attendee', 'lead', 'safety'])(
      '%s can open their own notifications',
      async (who) => {
        await inbox(who).expect(200);
        await unread(who).expect(200).expect({ unread: 0 });
        await markAll(who).expect(200).expect({ marked: 0 });
      },
    );

    it('roles with an event page get a link to it; others get none', async () => {
      for (const who of ['organiser', 'coordinator', 'staff', 'tech', 'attendee', 'lead', 'safety']) {
        await notify(who, NotificationType.EVENT_STATUS_CHANGED, 'Something happened.');
      }

      const linkOf = async (who: string) => (await inbox(who).expect(200)).body[0].link;
      expect(await linkOf('organiser')).toBe(`/organiser/${ids.gala}`);
      expect(await linkOf('coordinator')).toBe(`/coordinator/events/${ids.gala}`);
      expect(await linkOf('staff')).toBe(`/venues/events/${ids.gala}`);
      expect(await linkOf('tech')).toBe(`/equipment/requirements/${ids.gala}`);
      // The gala is PLANNING. An Attendee may only reach a CONFIRMED event
      // (US-02 AC-7), so no link is given here — a cancellation or a
      // registration-window notice, which concern CONFIRMED events, is what
      // links an Attendee to /events/:id (covered in notification-view.spec).
      expect(await linkOf('attendee')).toBeNull();
      // US-63: a Lead goes to the request in their incoming-work queue.
      expect(await linkOf('lead')).toBe(`/lead/unassigned/${ids.gala}`);
      // US-64: the Safety Officer goes to the event's safety review.
      expect(await linkOf('safety')).toBe(`/safety/checks/${ids.gala}`);
    });

    it('is refused without a token (401)', async () => {
      await http().get('/notifications').expect(401);
      await http().get('/notifications/unread-count').expect(401);
      await http().patch('/notifications/read-all').expect(401);
    });
  });
});
