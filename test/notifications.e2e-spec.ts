import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

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
 *
 * Pre-condition for every test: reset the testDB, then run base-users.sql,
 * tc-s1-25-setup.sql (the Lead) and tc-s3-59-setup.sql (a Safety Officer and
 * the "gala", EVT-195). The notifications a test reads come from the tc-s3
 * script its test case names (see docs/testing/sprint3-test-cases.md).
 */
describe('Notifications page (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  /** Fixed rows from base-users, tc-s1-25-setup and tc-s3-59-setup. */
  const ids: Record<string, string> = {
    organiser: 'USR-006',
    coordinator: 'USR-004',
    otherCoordinator: 'USR-005',
    staff: 'USR-010',
    tech: 'USR-009',
    attendee: 'USR-001',
    lead: 'USR-012',
    safety: 'USR-017',
    gala: 'EVT-195',
  };
  const LOGINS: Record<string, string> = {
    organiser: 'organiser@example.com',
    coordinator: 'coord.a@example.com',
    otherCoordinator: 'coord.b@example.com',
    staff: 'venue.staff@example.com',
    tech: 'tech.support@example.com',
    attendee: 'attendee@example.com',
    lead: 'lead@example.com',
    safety: 'safety@example.com',
  };

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

  /** Loads a test case's setup script(s) on top of the base scripts. */
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  const loadBase = async () => {
    await resetDb(prisma);
    await loadSql(prisma, 'base-users');
    await loadSql(prisma, 'tc-s1-25-setup');
    await loadSql(prisma, 'tc-s3-59-setup');
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    prisma = new PrismaClient();

    // Users keep their fixed IDs after every reset, so these tokens stay valid.
    await loadBase();
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
    await loadBase();
  });

  describe('US-52 AC-1: the Coordinator sees that a booked venue became unavailable, with the reason', () => {
    // TC-S3-61 · US-40 AC-5 (US-52 AC-1 notice) · setup: base-users + tc-s1-25-setup + tc-s3-59-setup + tc-s3-61b-setup · fails if the inbox drops the reason, event or link of a stored notice
    // Code: NotificationsInboxService.list -> splitReason, linkFor
    it('shows the notification, its reason, the event and a link to it', async () => {
      await given('tc-s3-61b-setup'); // the Coordinator's only notice: venue unavailable

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
    // TC-S3-61 · US-40 AC-5 (US-47 AC-6 notice) · setup: base-users + tc-s1-25-setup + tc-s3-59-setup + tc-s3-61b-setup · fails if the Organiser's newest notice is not shown first with its reason
    // Code: NotificationsInboxService.list -> splitReason, linkFor
    it('US-47 AC-6: shows the unfulfillable rejection with its reason and comment', async () => {
      await given('tc-s3-61b-setup'); // the Organiser's newest: the unfulfillable rejection

      const [item] = (await inbox('organiser').expect(200)).body;

      expect(item).toMatchObject({
        type: NotificationType.EVENT_STATUS_CHANGED,
        summary: 'Your event request "gala" has been rejected because it cannot be fulfilled.',
        reason: 'No suitable venue: Every hall is booked.',
        relatedEvent: { id: ids.gala, name: 'gala' },
        link: `/organiser/${ids.gala}`,
      });
    });

    // TC-S3-61 · US-40 AC-5 (US-48 AC-9 notice) · setup: base-users + tc-s1-25-setup + tc-s3-59-setup + tc-s3-60b-setup · fails if the change request outcome loses its reason or link
    // Code: NotificationsInboxService.list -> splitReason, linkFor
    it('US-48 AC-9: shows the change request outcome with the reason', async () => {
      await given('tc-s3-60b-setup');

      const [item] = (await inbox('organiser').expect(200)).body;

      expect(item).toMatchObject({
        summary: 'Your change request for "gala" was rejected.',
        reason: 'The hall seats 50.',
        link: `/organiser/${ids.gala}`,
      });
    });

    // TC-S3-67 · US-41 AC-5 · setup: base-users + tc-s1-25-setup + tc-s3-59-setup + tc-s3-67-setup · fails if the Coordinator's rejection notice drops the suggested alternatives
    // Code: NotificationsInboxService.list -> splitReason
    it('US-41: the Coordinator sees a rejection with its suggested alternatives', async () => {
      await given('tc-s3-67-setup');

      const [item] = (await inbox('coordinator').expect(200)).body;

      expect(item).toMatchObject({
        type: NotificationType.VENUE_BOOKING_DECIDED,
        reason: 'Closed for repairs. Alternative venues suggested: East Hall.',
        link: `/coordinator/events/${ids.gala}`,
      });
    });
  });

  describe('each user sees only their own notifications', () => {
    // TC-S3-61 · US-40 AC-5 · setup: base-users + tc-s1-25-setup + tc-s3-59-setup + tc-s3-61b-setup · fails if a user sees someone else's notices, or their own out of order
    // Code: NotificationsInboxService.list filters by recipientId, orders by createdAt desc
    it('lists only the caller’s, newest first', async () => {
      await given('tc-s3-61b-setup'); // Organiser 10:00 and 12:00, Coordinator 11:00

      const organiser = (await inbox('organiser').expect(200)).body;
      expect(organiser.map((n: { message: string }) => n.message)).toEqual([
        MESSAGES.unfulfillable,
        MESSAGES.changeRejected,
      ]);

      const coordinator = (await inbox('coordinator').expect(200)).body;
      expect(coordinator.map((n: { message: string }) => n.message)).toEqual([MESSAGES.venueUnavailable]);

      await inbox('otherCoordinator').expect(200).expect([]);
    });

    // TC-S3-60 · US-40 AC-4 · setup: base-users + tc-s1-25-setup + tc-s3-59-setup + tc-s3-60b-setup · fails if a user can mark someone else's notice read
    // Code: NotificationsInboxService.markRead scopes to the caller
    it('refuses to mark another user’s notification (404), and leaves it unread', async () => {
      await given('tc-s3-60b-setup');
      const mine = 'NTF-011'; // the Organiser's

      await markRead(mine, 'coordinator').expect(404);
      await markRead('no-such-notification', 'organiser').expect(404);

      const stored = await prisma.notification.findUniqueOrThrow({ where: { id: mine } });
      expect(stored).toMatchObject({ read: false, readAt: null });
    });
  });

  describe('unread count and marking read', () => {
    // TC-S3-60 · US-40 AC-4 · setup: base-users + tc-s1-25-setup + tc-s3-59-setup + tc-s3-60c-setup · fails if the unread count does not follow marking one, then all
    // Code: NotificationsInboxService.unreadCount / markRead / markAllRead
    it('updates the count after marking one read, then all', async () => {
      await given('tc-s3-60c-setup'); // three unread for the Organiser
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

    // TC-S3-60 · US-40 AC-4 · setup: base-users + tc-s1-25-setup + tc-s3-59-setup + tc-s3-60b-setup · fails if marking unread leaves the read time or the count wrong
    // Code: NotificationsInboxService.markUnread
    it('marks one unread again: it counts again and its read time is cleared', async () => {
      await given('tc-s3-60b-setup');
      const id = 'NTF-011';
      await markRead(id, 'organiser').expect(200);
      await unread('organiser').expect(200).expect({ unread: 0 });

      const res = await markUnread(id, 'organiser').expect(200);

      expect(res.body).toMatchObject({ id, read: false, readAt: null });
      await unread('organiser').expect(200).expect({ unread: 1 });
    });

    // TC-S3-60 · US-40 AC-4 · setup: base-users + tc-s1-25-setup + tc-s3-59-setup + tc-s3-60b-setup · fails if a user can mark someone else's notice unread
    // Code: NotificationsInboxService.markUnread scopes to the caller
    it('refuses to mark another user’s notification unread (404), leaving it read', async () => {
      await given('tc-s3-60b-setup');
      const id = 'NTF-011';
      await markRead(id, 'organiser').expect(200);

      await markUnread(id, 'coordinator').expect(404);

      const stored = await prisma.notification.findUniqueOrThrow({ where: { id } });
      expect(stored.read).toBe(true);
    });

    // TC-S3-60 · US-40 AC-4 · setup: base-users + tc-s1-25-setup + tc-s3-59-setup + tc-s3-60b-setup · fails if marking read twice overwrites the first read time
    // Code: NotificationsInboxService.markRead keeps an existing readAt
    it('marking one read twice keeps its first read time', async () => {
      await given('tc-s3-60b-setup');
      const id = 'NTF-011';

      const first = (await markRead(id, 'organiser').expect(200)).body.readAt;
      const second = (await markRead(id, 'organiser').expect(200)).body.readAt;

      expect(second).toBe(first);
    });

    // TC-S3-60 · US-40 AC-4 · setup: base-users + tc-s1-25-setup + tc-s3-59-setup + tc-s3-61b-setup · fails if mark all read touches another user's notices
    // Code: NotificationsInboxService.markAllRead scopes to the caller
    it('mark all read touches only the caller’s notifications', async () => {
      await given('tc-s3-61b-setup'); // two for the Organiser, one for the Coordinator

      await markAll('organiser').expect(200);

      await unread('coordinator').expect(200).expect({ unread: 1 });
    });
  });

  describe('role access', () => {
    // TC-S3-60 · US-40 AC-4 · setup: base-users + tc-s1-25-setup + tc-s3-59-setup · fails if a role cannot open its own notifications
    // Code: NotificationsController, permission NOTIFICATION:READ for every role
    it.each(['organiser', 'coordinator', 'staff', 'tech', 'attendee', 'lead', 'safety'])(
      '%s can open their own notifications',
      async (who) => {
        await inbox(who).expect(200);
        await unread(who).expect(200).expect({ unread: 0 });
        await markAll(who).expect(200).expect({ marked: 0 });
      },
    );

    // TC-S3-59 · US-40 AC-3 · setup: base-users + tc-s1-25-setup + tc-s3-59-setup + tc-s3-59b-setup · fails if a role's notice links to the wrong page, or an Attendee is linked to an event they cannot see
    // Code: notification-view.ts linkFor
    it('roles with an event page get a link to it; others get none', async () => {
      await given('tc-s3-59b-setup'); // one notice about the gala per role

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

    // TC-S3-60 · US-40 AC-4 · setup: base-users + tc-s1-25-setup + tc-s3-59-setup · fails if the inbox answers without a token
    // Code: JwtAuthGuard on NotificationsController
    it('is refused without a token (401)', async () => {
      await http().get('/notifications').expect(401);
      await http().get('/notifications/unread-count').expect(401);
      await http().patch('/notifications/read-all').expect(401);
    });
  });
});
