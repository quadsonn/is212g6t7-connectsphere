import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BookingDecisionKind,
  BookingStatus,
  EventRequest,
  EventStatus,
  NotificationType,
  PrismaClient,
  ReservationStatus,
} from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { BookingsService } from '../src/bookings/bookings.service';
import { configureApp } from '../src/configure-app';
import { EventsService } from '../src/events/events.service';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-44 e2e — releasing venue bookings when their event is cancelled.
 *
 * The cancel endpoint is US-43's and does not exist yet; every path that
 * cancels goes through EventsService.setStatus(event, CANCELLED), which is
 * what these tests call. (US-43's endpoint now exists and is tested in
 * us43-cancel-event.e2e-spec.ts; these tests keep calling setStatus directly,
 * as every cancelling path does.)
 *
 * Pre-condition for every test: reset the testDB, then run base-users.sql,
 * base-venues.sql, tc-s3-54-setup.sql (the "Gala", EVT-194; Sam, USR-016,
 * managing East Annex) and tc-s3-83-setup.sql ("Other" EVT-211 and "Next"
 * EVT-212). Each test loads the booking scripts its test case names.
 */
describe('US-44 release venue bookings on event cancellation (e2e)', () => {
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

  const at = (time: string, day = '2030-10-01') => new Date(`${day}T${time}:00Z`);

  /** Loads a test case's setup script(s) on top of the base scripts. */
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  /** The events as stored: the Gala (EVT-194), "Other" (EVT-211), "Next" (EVT-212). */
  const EVENTS: Record<string, string> = { Gala: 'EVT-194', Other: 'EVT-211', Next: 'EVT-212' };
  const seedEvent = (name = 'Gala') =>
    prisma.eventRequest.findUniqueOrThrow({ where: { id: EVENTS[name] } });

  const cancel = (event: EventRequest, actorId?: string) =>
    app.get(EventsService).setStatus(event, EventStatus.CANCELLED, undefined, actorId);

  const booking = (id: string) => prisma.venueBooking.findUniqueOrThrow({ where: { id } });

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
    await loadSql(prisma, 'tc-s3-83-setup');
  });

  describe('AC-1/AC-3/AC-4: every live booking is released, and kept', () => {
    // TC-S3-83, TC-S3-85 · US-44 AC-1/AC-3 · setup: base-users + base-venues + tc-s3-54-setup + tc-s3-83-setup + tc-s3-83b-setup · fails if a pending, held or confirmed booking is not released, the reason or time is missing, a rejected one is touched, or a row is deleted
    // Code: EventsService.setStatus(CANCELLED) -> BookingsService.releaseForCancelledEvent
    it('US-44: pending, held and confirmed bookings become RELEASED with the reason and a timestamp; rejected ones are untouched', async () => {
      await given('tc-s3-83b-setup');
      const event = await seedEvent();
      const [pending, held, confirmed, rejected] = [{ id: 'BKG-100' }, { id: 'BKG-101' }, { id: 'BKG-102' }, { id: 'BKG-103' }];
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

    // TC-S3-85 · US-44 AC-3 · setup: base-users + base-venues + tc-s3-54-setup + tc-s3-83-setup + tc-s3-55-setup + tc-s3-83c-setup · fails if a release is not recorded in the booking's history, or names the wrong actor
    // Code: releaseForCancelledEvent -> BookingDecision(kind RELEASE)
    it('US-44: each release is recorded in the booking history, by the system or by the canceller', async () => {
      await given('tc-s3-55-setup', 'tc-s3-83c-setup');
      const event = await seedEvent();
      const a = { id: 'BKG-079' };

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
      const b = { id: 'BKG-104' };
      await cancel(other, ids.organiser);
      expect((await prisma.bookingDecision.findFirstOrThrow({ where: { bookingId: b.id } })).decidedById).toBe(ids.organiser);
    });

    // TC-S3-83 · US-44 AC-1 · setup: base-users + base-venues + tc-s3-54-setup + tc-s3-83-setup + tc-s3-83d-setup · fails if a flagged booking stays held or keeps its flag
    // Code: releaseForCancelledEvent clears needsReview
    it('US-44: a booking flagged "Conflict - needs review" is released too, and its flag cleared', async () => {
      await given('tc-s3-83d-setup');
      const event = await seedEvent();
      const flagged = { id: 'BKG-105' };

      await cancel(event);

      expect(await booking(flagged.id)).toMatchObject({ status: BookingStatus.RELEASED, needsReview: false });
    });
  });

  describe('AC-5/AC-6: managers are told; other bookings are not touched', () => {
    // TC-S3-83, TC-S3-86 · US-44 AC-1/AC-4 · setup: base-users + base-venues + tc-s3-54-setup + tc-s3-83-setup + tc-s3-55-setup + tc-s3-86-setup · fails if a venue of a multi-venue event stays booked, or a manager is not told (or told twice)
    // Code: releaseForCancelledEvent -> VenueActivityNotifier.eventCancelled
    it('US-44: an event on two venues releases both, and tells each manager once', async () => {
      await given('tc-s3-55-setup', 'tc-s3-86-setup');
      const event = await seedEvent();
      const onHall = { id: 'BKG-079' };
      const onAnnex = { id: 'BKG-106' };

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
        /^Booking for .* UTC released\.$/,
      );
    });

    // TC-S3-87 · US-44 AC-5 · setup: base-users + base-venues + tc-s3-54-setup + tc-s3-83-setup + tc-s3-55-setup + tc-s3-87-setup · fails if cancelling one event touches another event's booking
    // Code: releaseForCancelledEvent scopes to the event
    it("US-44: another event's booking on the same venue is unchanged", async () => {
      await given('tc-s3-55-setup', 'tc-s3-87-setup');
      const event = await seedEvent();
      const neighbour = { id: 'BKG-107' }; // "Other", Main Hall 08:00-12:00

      await cancel(event);

      expect(await booking(neighbour.id)).toMatchObject({ status: BookingStatus.APPROVED, releasedAt: null });
    });
  });

  describe('AC-2: the slot is available straight away', () => {
    // TC-S3-84 · US-44 AC-2 · setup: base-users + base-venues + tc-s3-54-setup + tc-s3-83-setup + tc-s3-55-setup · fails if a released slot still shows as taken anywhere, or cannot be booked again
    // Code: calendar, venue availability and search ignore RELEASED bookings
    it('US-44: calendar, availability and search show it free, and a new request for it succeeds and can be approved', async () => {
      await given('tc-s3-55-setup');
      const event = await seedEvent();
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

    // TC-S3-85 · US-44 AC-3 · setup: base-users + base-venues + tc-s3-54-setup + tc-s3-83-setup + tc-s3-55-setup · fails if the release is missing from the queue history
    // Code: BookingsService queue view=decided includes RELEASED
    it('US-44: the release shows in the Venue Staff queue history as Released', async () => {
      await given('tc-s3-55-setup');
      const event = await seedEvent();
      const released = { id: 'BKG-079' };

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
    // TC-S3-83 · US-44 AC-1 (with US-33) · setup: base-users + base-venues + tc-s3-54-setup + tc-s3-83-setup + tc-s3-55-setup + tc-s3-83e-setup · fails if releasing venues stops the equipment being released
    // Code: setStatus(CANCELLED) -> EquipmentReservationsService.releaseForCancelledEvent
    it("US-44: the event's equipment is still released (US-33)", async () => {
      await given('tc-s3-55-setup', 'tc-s3-83e-setup');
      const event = await seedEvent();
      const reservation = { id: 'RSV-020' }; // 2 wireless microphones

      await cancel(event);

      expect((await prisma.equipmentReservation.findUniqueOrThrow({ where: { id: reservation.id } })).status).toBe(
        ReservationStatus.RELEASED,
      );
    });

    // TC-S3-87 · US-44 AC-5 (with US-51) · setup: base-users + base-venues + tc-s3-54-setup + tc-s3-83-setup + tc-s3-87b-setup · fails if the other event's booking keeps a review flag that no longer applies, or is changed otherwise
    // Code: releaseForCancelledEvent -> recheckReviewFlags
    it("US-44: releasing one of a clashing pair clears the other's review flag (US-51)", async () => {
      await given('tc-s3-87b-setup'); // 30-minute buffers; the Gala 10:00-12:00 and Other 12:30-14:00 both flagged
      const event = await seedEvent();
      const partner = { id: 'BKG-109' };

      await cancel(event);

      expect(await booking(partner.id)).toMatchObject({ status: BookingStatus.APPROVED, needsReview: false });
    });
  });

  describe('Rollback', () => {
    // TC-S3-83 · US-44 AC-1 · setup: base-users + base-venues + tc-s3-54-setup + tc-s3-83-setup + tc-s3-55-setup + tc-s3-83e-setup · fails if a failed release leaves the event cancelled, or something released or notified
    // Code: setStatus runs the releases in the cancellation's transaction
    it('US-44: if the release fails, the event is not cancelled and nothing is released or sent', async () => {
      await given('tc-s3-55-setup', 'tc-s3-83e-setup');
      const event = await seedEvent();
      const approved = { id: 'BKG-079' };
      const reservation = { id: 'RSV-020' };
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
