import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, NotificationType, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-43 (Story 43) e2e — the Organiser cancels their own event through
 * POST /events/:id/cancel.
 *
 * Code under test: EventsCancellationService.cancel (event-cancellation.rules
 * evaluateCancellation, CancelEventDto, setStatus(CANCELLED) releasing venue
 * bookings, holds and equipment, closePendingChangeRequests, recordChange,
 * notifyCancelled).
 *
 * Pre-condition for every test: reset the testDB, then run base-users.sql,
 * base-venues.sql and tc-s3-75-setup.sql ("Autumn Festival", EVT-205, with
 * two approved venues, a hold, 2 PA systems reserved, a pending change request
 * and one Registered and one Withdrawn Attendee).
 */
describe('US-43 cancel an event (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const EVENT = 'EVT-205';
  const USERS = {
    organiser: 'organiser@example.com',
    otherOrganiser: 'other@example.com',
    coordinator: 'coord.a@example.com',
    tech: 'tech.support@example.com',
    attendee: 'attendee@example.com',
  } as const;
  const tokens: Record<string, string> = {};

  const as = (who: keyof typeof USERS) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const cancel = (id: string, body: object = { reason: 'Keynote speaker withdrew', confirm: true }, who: keyof typeof USERS = 'organiser') =>
    http().post(`/events/${id}/cancel`).set('Authorization', as(who)).send(body);
  const statusOf = async (id: string) => (await prisma.eventRequest.findUniqueOrThrow({ where: { id } })).status;
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    prisma = new PrismaClient();

    // Users keep their fixed IDs after every reset, so these tokens stay valid.
    await resetDb(prisma);
    await loadSql(prisma, 'base-users');
    await loadSql(prisma, 'tc-s1-22-setup');
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
    await loadSql(prisma, 'tc-s3-75-setup');
  });

  describe('AC-1: only my own events, from submitted until the event starts', () => {
    // TC-S3-75 · US-43 AC-1 · setup: base-users + base-venues + tc-s3-75-setup + tc-s3-75b-setup · fails if a draft, rejected, completed, cancelled or started event can be cancelled
    // Code: evaluateCancellation (CANCELLABLE_STATUSES, start <= now)
    it.each([
      ['EVT-206', EventStatus.DRAFT, 'a draft event cannot be cancelled'],
      ['EVT-207', EventStatus.REJECTED, 'a rejected event cannot be cancelled'],
      ['EVT-208', EventStatus.COMPLETED, 'a completed event cannot be cancelled'],
      ['EVT-209', EventStatus.CANCELLED, 'a cancelled event cannot be cancelled'],
      ['EVT-210', EventStatus.PLANNING, 'an event that has already started cannot be cancelled'],
    ])('refuses %s (%s) with 409 and leaves it as it was', async (id, status, message) => {
      await given('tc-s3-75b-setup');

      const res = await cancel(id).expect(409);

      expect(res.body.message).toBe(message);
      expect(await statusOf(id)).toBe(status);
    });

    // TC-S3-75 · US-43 AC-1 · setup: base-users + base-venues + tc-s3-75-setup · fails if another Organiser or another role can cancel the event
    // Code: AccessControlService (own events only, 404); @Roles(EVENT_ORGANISER)
    it("refuses another Organiser's event (404) and other roles (403)", async () => {
      await cancel(EVENT, undefined, 'otherOrganiser').expect(404);
      await cancel(EVENT, undefined, 'coordinator').expect(403);

      expect(await statusOf(EVENT)).toBe(EventStatus.PLANNING);
    });
  });

  describe('AC-2: a reason is required and the cancellation must be confirmed', () => {
    // TC-S3-76 · US-43 AC-2 · setup: base-users + base-venues + tc-s3-75-setup · fails if an event can be cancelled without a reason or without confirming
    // Code: CancelEventDto (@IsNotEmpty reason after trim, @Equals(true) confirm)
    it.each([
      ['no reason', { confirm: true }],
      ['a blank reason', { reason: '   ', confirm: true }],
      ['no confirmation', { reason: 'Keynote speaker withdrew' }],
      ['confirm false', { reason: 'Keynote speaker withdrew', confirm: false }],
    ])('refuses %s with 400 and cancels nothing', async (_label, body) => {
      await cancel(EVENT, body).expect(400);

      expect(await statusOf(EVENT)).toBe(EventStatus.PLANNING);
    });
  });

  describe('AC-3, AC-4, AC-6: cancelling', () => {
    // TC-S3-77, TC-S3-78, TC-S3-80 · US-43 AC-3/AC-4/AC-6 · setup: base-users + base-venues + tc-s3-75-setup · fails if the status, reason, who or when is not recorded, any booking, hold or reservation stays held, or the pending change request stays open
    // Code: EventsCancellationService.cancel -> setStatus(CANCELLED) (releases), closePendingChangeRequests, recordChange
    it('cancels the event, releases everything in the same request, closes the change request and records the change', async () => {
      const before = Date.now();

      const res = await cancel(EVENT).expect(200);

      expect(res.body.released).toEqual({ venueBookings: 3, equipmentReservations: 1 });
      expect(await statusOf(EVENT)).toBe(EventStatus.CANCELLED);
      const bookings = await prisma.venueBooking.findMany({ where: { eventId: EVENT }, orderBy: { id: 'asc' } });
      expect(bookings.map((b) => b.status)).toEqual(['RELEASED', 'RELEASED', 'RELEASED']);
      expect((await prisma.equipmentReservation.findUniqueOrThrow({ where: { id: 'RSV-019' } })).status).toBe('RELEASED');
      expect((await prisma.eventChangeRequest.findUniqueOrThrow({ where: { id: 'CRQ-007' } })).status).toBe('CLOSED');

      const [change] = await prisma.eventChange.findMany({ where: { eventId: EVENT } });
      expect(change.changedById).toBe('USR-006');
      expect(change.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(JSON.stringify(change.changes)).toContain('Keynote speaker withdrew');
      expect(JSON.stringify(change.changes)).toContain(EventStatus.CANCELLED);
    });
  });

  describe('AC-5: released slots and equipment are available again', () => {
    // TC-S3-79 · US-43 AC-5 · setup: base-users + base-venues + tc-s3-75-setup · fails if the venue still shows booked or the equipment is still counted as reserved after cancelling
    // Code: venue availability calendar and EquipmentAvailability ignore RELEASED rows
    it('shows Main Hall free and all 4 PA systems available', async () => {
      const hall = () =>
        http().get('/venues/VEN-002/availability?month=2030-12').set('Authorization', as('coordinator')).expect(200);
      const pa = () =>
        http()
          .get('/equipment/EQP-014/availability')
          .query({ start: '2030-12-05T01:00:00.000Z', end: '2030-12-05T09:00:00.000Z', quantity: 4 })
          .set('Authorization', as('tech'))
          .expect(200);
      const dec5 = (body: { date: string; status: string }[]) => body.find((d) => d.date === '2030-12-05')?.status;
      expect(dec5((await hall()).body)).toBe('booked');
      expect((await pa()).body).toMatchObject({ availableQuantity: 2 });

      await cancel(EVENT).expect(200);

      expect(dec5((await hall()).body)).toBe('free');
      expect((await pa()).body).toMatchObject({ availableQuantity: 4 });
    });
  });

  describe('AC-7: a cancelled event cannot be edited, changed or registered for', () => {
    // TC-S3-81 · US-43 AC-7 · setup: base-users + base-venues + tc-s3-75-setup · fails if a cancelled event can still be edited, receive a change request, or take a registration
    // Code: planning edit, change request and registration rules refuse CANCELLED
    it('refuses an edit, a change request and a registration', async () => {
      await cancel(EVENT).expect(200);

      await http()
        .patch(`/events/${EVENT}/planning`)
        .set('Authorization', as('coordinator'))
        .send({ description: 'New description' })
        .expect(409);
      await http()
        .post(`/events/${EVENT}/change-requests`)
        .set('Authorization', as('organiser'))
        .send({ reason: 'One more day', proposedAttendance: 120 })
        .expect(409);
      await http()
        .post('/registrations')
        .set('Authorization', as('attendee'))
        .send({ eventId: EVENT, phone: '+65 9123 4567' })
        .expect(404); // a cancelled event is not visible to Attendees (denied = 404)
    });
  });

  describe('AC-8: the Coordinator and registered Attendees are notified', () => {
    // TC-S3-82 · US-43 AC-8 · setup: base-users + base-venues + tc-s3-75-setup · fails if the Coordinator or a Registered Attendee is not told, or a Withdrawn Attendee is
    // Code: EventsCancellationService.notifyCancelled
    it('notifies the Coordinator and the Registered Attendee, not the Withdrawn one', async () => {
      await cancel(EVENT).expect(200);

      const notices = await prisma.notification.findMany({
        where: { type: NotificationType.EVENT_CANCELLED, recipientId: { in: ['USR-004', 'USR-001', 'USR-019'] } },
        orderBy: { recipientId: 'asc' },
      });
      expect(notices.map((n) => n.recipientId)).toEqual(['USR-001', 'USR-004']);
      for (const notice of notices) {
        expect(notice.relatedEventId).toBe(EVENT);
        expect(notice.message).toContain('Autumn Festival');
        expect(notice.message).toContain('Keynote speaker withdrew');
      }
    });
  });
});
