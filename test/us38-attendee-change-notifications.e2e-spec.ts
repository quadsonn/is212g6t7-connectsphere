import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-38 (Story 38) e2e — registered Attendees are told when their event's
 * date, time or venue changes.
 *
 * Code under test: AttendeeChangeNotifier.notifyRegisteredAttendees, called
 * after an approved change request (EventsChangeReviewService.approve), a
 * planning edit (EventsService.updateDuringPlanning) and a venue booking
 * approval that replaces an earlier venue (BookingsService, via
 * notifyAttendeesIfVenueReplaced). Only date, time and venue count
 * (event-schedule-change.ts SCHEDULE_FIELDS); only REGISTERED registrations
 * are told.
 *
 * Pre-condition for every test: reset the testDB, then run base-users.sql and
 * base-venues.sql; each test loads the tc-s3 script its test case names (see
 * docs/testing/sprint3-test-cases.md).
 */
describe('US-38 attendee change notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';

  /** Fixed rows from base-users.sql. */
  const USERS = {
    coordinator: 'coord.a@example.com',
    staff: 'venue.staff@example.com',
  } as const;
  const tokens: Record<string, string> = {};

  const as = (who: keyof typeof USERS) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  /** Loads a test case's setup script(s) on top of the base scripts. */
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  const scheduleNotices = () =>
    prisma.notification.findMany({
      where: { type: NotificationType.EVENT_SCHEDULE_CHANGED },
      orderBy: { recipientId: 'asc' },
    });

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
    for (const [key, email] of Object.entries(USERS)) {
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
    await loadSql(prisma, 'base-venues');
  });

  describe('AC-1 to AC-4: an approved change request moves the date and time', () => {
    // TC-S3-38, TC-S3-41, TC-S3-42, TC-S3-43 · US-38 AC-1/2/3/4 · setup: base-users + base-venues + tc-s3-38-setup · fails if an approved date/time change tells no one, tells a withdrawn Attendee, omits a field's old or new value, or sends one notice per field
    // Code: EventsChangeReviewService.approve -> scheduleChangesFrom -> AttendeeChangeNotifier
    it('sends each Registered Attendee one notice listing every changed field, old and new', async () => {
      await given('tc-s3-38-setup');

      await http()
        .post('/events/change-requests/CRQ-006/approve')
        .set('Authorization', as('coordinator'))
        .expect(200);

      const notices = await scheduleNotices();
      // AC-2: Registered only (USR-001, USR-014), never the withdrawn USR-015.
      expect(notices.map((n) => n.recipientId)).toEqual(['USR-001', 'USR-014']);
      for (const notice of notices) {
        expect(notice.relatedEventId).toBe('EVT-191');
        // AC-3 and AC-4: the event name, then each field with its old and new
        // value (Singapore time), all in this one notice.
        expect(notice.message).toContain('"Harbour Gala"');
        expect(notice.message).toContain('Start: 1 Oct 2030, 09:00 → 2 Oct 2030, 09:00');
        expect(notice.message).toContain('End: 1 Oct 2030, 17:00 → 2 Oct 2030, 18:00');
      }
    });
  });

  describe('AC-1 and AC-5: a replacement venue is approved', () => {
    // TC-S3-39, TC-S3-44 · US-38 AC-1/AC-5 · setup: base-users + base-venues + tc-s3-39-setup · fails if replacing a reversed venue tells no one, or the notice does not name the venue that changed
    // Code: BookingsService decide (APPROVED) -> notifyAttendeesIfVenueReplaced -> venueChange
    it('names the replaced venue and its replacement, not the event’s other venue', async () => {
      await given('tc-s3-39-setup');

      await http().post('/bookings/BKG-077/approve').set('Authorization', as('staff')).send({}).expect(200);

      const notices = await scheduleNotices();
      expect(notices.map((n) => n.recipientId)).toEqual(['USR-001']);
      expect(notices[0].message).toContain('"Riverside Fair"');
      expect(notices[0].message).toContain('Venue: Main Hall → Seminar Room');
      expect(notices[0].message).not.toContain('Rooftop Terrace');
    });

    // TC-S3-40 · US-38 AC-1 · setup: base-users + base-venues + tc-s3-40-setup · fails if a venue replaced through the Story 52 replacement request tells no one
    // Code: POST /bookings with replacesBookingId, then BookingsService decide (APPROVED) -> releaseReplaced
    // KNOWN BUG (audit gap #4): the replaced booking is RELEASED, but
    // notifyAttendeesIfVenueReplaced only looks for an earlier booking that was
    // approved and then REJECTED, so this replacement tells no one. Switch to
    // it(...) when the fix lands.
    it.failing('tells Registered Attendees when a Story 52 replacement request is approved', async () => {
      await given('tc-s3-40-setup');

      const replacement = await http()
        .post('/bookings')
        .set('Authorization', as('coordinator'))
        .send({
          eventId: 'EVT-193',
          venueId: 'VEN-004',
          start: '2030-10-08T01:00:00.000Z',
          end: '2030-10-08T09:00:00.000Z',
          expectedAttendance: 60,
          replacesBookingId: 'BKG-078',
        })
        .expect(201);
      await http()
        .post(`/bookings/${replacement.body.id}/approve`)
        .set('Authorization', as('staff'))
        .send({})
        .expect(200);

      const notices = await scheduleNotices();
      expect(notices.map((n) => n.recipientId)).toEqual(['USR-001']);
      expect(notices[0].message).toContain('Venue: Main Hall → Rooftop Terrace');
    });
  });

  describe('AC-6: other fields do not notify', () => {
    // TC-S3-45 · US-38 AC-6 · setup: base-users + base-venues + tc-s3-38-setup · fails if editing a field other than date, time or venue notifies Attendees
    // Code: EventsService.updateDuringPlanning -> scheduleChangesFrom keeps only proposedStart/proposedEnd
    it('sends nothing when only the description changes', async () => {
      await given('tc-s3-38-setup');

      await http()
        .patch('/events/EVT-191/planning')
        .set('Authorization', as('coordinator'))
        .send({ description: 'Now with a harbour fireworks finale' })
        .expect(200);

      expect(await scheduleNotices()).toEqual([]);
    });
  });
});
