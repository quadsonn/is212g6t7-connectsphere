import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus, EventStatus, NotificationType, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { VenueUnavailabilityService } from '../src/bookings/venue-unavailability.service';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-52 e2e — a booked venue becomes unavailable, the Coordinator is told and
 * requests a replacement, and the original is released once the replacement
 * is confirmed. One describe per acceptance criterion, named "US-52 AC-n".
 *
 * #57 (Venue Staff marking a venue unavailable) is not built, so each test
 * records the unavailability directly — a US-16 blocked-out period — and calls
 * the hook #57 will call, VenueUnavailabilityService.handleVenueUnavailable.
 * That call is the action under test, so it stays in the tests.
 *
 * Pre-condition for every test: reset the testDB, then run base-users.sql,
 * tc-s1-96-setup.sql (Vince, USR-013) and tc-s3-141-setup.sql (mainHall
 * VEN-073, eastHall VEN-074, "showcase" EVT-266 with its approved mainHall
 * booking BKG-145). Other bookings come from the tc-s3-14x scripts each test
 * names.
 */
describe('US-52 unavailable venue replacement (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let unavailability: VenueUnavailabilityService;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  /** Fixed rows from base-users, tc-s1-96-setup and the tc-s3-141 scripts. */
  const ids: Record<string, string> = {
    organiser: 'USR-006',
    coordinator: 'USR-004',
    otherCoordinator: 'USR-005',
    staff: 'USR-010',
    otherStaff: 'USR-013',
    tech: 'USR-009',
    attendee: 'USR-001',
    mainHall: 'VEN-073',
    eastHall: 'VEN-074',
    westHall: 'VEN-075',
    showcase: 'EVT-266',
    original: 'BKG-145',
    pendingEvent: 'EVT-267',
    pending: 'BKG-146',
    rejectedEvent: 'EVT-268',
    rejected: 'BKG-147',
    later: 'EVT-269',
    laterBooking: 'BKG-148',
    elsewhere: 'EVT-270',
    elsewhereBooking: 'BKG-149',
    otherEvent: 'EVT-271',
    otherBooking: 'BKG-150',
    unassigned: 'EVT-272',
    unassignedBooking: 'BKG-151',
    mine2: 'EVT-273',
    breakout: 'BKG-152',
  };
  const LOGINS: Record<string, string> = {
    organiser: 'organiser@example.com',
    coordinator: 'coord.a@example.com',
    otherCoordinator: 'coord.b@example.com',
    staff: 'venue.staff@example.com',
    otherStaff: 'venue.staff2@example.com',
    tech: 'tech.support@example.com',
    attendee: 'attendee@example.com',
  };

  // The affected booking's slot, and the period the venue is unavailable.
  const START = '2030-10-01T09:00:00.000Z';
  const END = '2030-10-01T12:00:00.000Z';
  const PERIOD = {
    start: new Date('2030-09-30T00:00:00.000Z'),
    end: new Date('2030-10-02T00:00:00.000Z'),
  };
  const REASON = 'Flood damage in the main hall';

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  /** Loads a test case's setup script(s) on top of the base scripts. */
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  /** What #57 will do: record the unavailability, then call the hook. */
  const markUnavailable = async (venue: string, period = PERIOD, reason = REASON) => {
    await prisma.venueBlock.create({
      data: {
        venueId: ids[venue],
        start: period.start,
        end: period.end,
        reason,
        createdById: ids.staff,
      },
    });
    return unavailability.handleVenueUnavailable(ids[venue], period, reason);
  };

  const flagged = (who = 'coordinator') =>
    http().get('/bookings/replacements-needed').set('Authorization', as(who));

  const requestReplacement = (
    body: { venueId: string; replacesBookingId: string; start?: string; end?: string },
    who = 'coordinator',
    event = 'showcase',
  ) =>
    http()
      .post('/bookings')
      .set('Authorization', as(who))
      .send({ eventId: ids[event], start: START, end: END, expectedAttendance: 80, ...body });

  const decide = (id: string, action: 'approve' | 'reject', body: object = {}, who = 'otherStaff') =>
    http().post(`/bookings/${id}/${action}`).set('Authorization', as(who)).send(body);

  const notificationsOf = (who: string) =>
    prisma.notification.findMany({
      where: { recipientId: ids[who], type: NotificationType.VENUE_UNAVAILABLE },
    });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');

    prisma = new PrismaClient();
    unavailability = app.get(VenueUnavailabilityService);

    // Users keep their fixed IDs after every reset, so these tokens stay valid.
    await resetDb(prisma);
    await loadSql(prisma, 'base-users');
    await loadSql(prisma, 'tc-s1-96-setup');
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
    await resetDb(prisma);
    await loadSql(prisma, 'base-users');
    await loadSql(prisma, 'tc-s1-96-setup');
    await loadSql(prisma, 'tc-s3-141-setup');
  });

  describe('US-52 trigger: affected bookings are identified, nothing else changes', () => {
    // TC-S3-141 · US-52 AC-1 · setup: base-users + tc-s1-96-setup + tc-s3-141-setup · fails if the wrong bookings are marked as affected, the event or booking is changed, or it is marked twice
    // Code: VenueUnavailabilityService.handleVenueUnavailable
    it('marks the overlapping booking as needing a replacement, with the period and reason', async () => {
      const affected = await markUnavailable('mainHall');

      expect(affected).toEqual([
        expect.objectContaining({ bookingId: ids.original, eventId: ids.showcase }),
      ]);
      const stored = await prisma.venueBooking.findUniqueOrThrow({ where: { id: ids.original } });
      expect(stored).toMatchObject({
        status: BookingStatus.APPROVED,
        unavailableFrom: PERIOD.start,
        unavailableUntil: PERIOD.end,
        unavailableReason: REASON,
        replacedByBookingId: null,
      });
      expect(stored.replacementNeededAt).not.toBeNull();
    });

    // TC-S3-141 · US-52 AC-1 · setup: base-users + tc-s1-96-setup + tc-s3-141-setup · fails if the wrong bookings are marked as affected, the event or booking is changed, or it is marked twice
    // Code: VenueUnavailabilityService.handleVenueUnavailable
    it('does not cancel the event or change its details, or the booking itself', async () => {
      const eventBefore = await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.showcase } });
      const bookingBefore = await prisma.venueBooking.findUniqueOrThrow({ where: { id: ids.original } });

      await markUnavailable('mainHall');

      const eventAfter = await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.showcase } });
      expect(eventAfter).toEqual(eventBefore);
      expect(eventAfter.status).toBe(EventStatus.PLANNING);

      const bookingAfter = await prisma.venueBooking.findUniqueOrThrow({ where: { id: ids.original } });
      expect({
        status: bookingAfter.status,
        start: bookingAfter.start,
        end: bookingAfter.end,
        venueId: bookingAfter.venueId,
        expectedAttendance: bookingAfter.expectedAttendance,
      }).toEqual({
        status: bookingBefore.status,
        start: bookingBefore.start,
        end: bookingBefore.end,
        venueId: bookingBefore.venueId,
        expectedAttendance: bookingBefore.expectedAttendance,
      });
    });

    // TC-S3-141 · US-52 AC-1 · setup: base-users + tc-s1-96-setup + tc-s3-141-setup + tc-s3-141b-setup · fails if the wrong bookings are marked as affected, the event or booking is changed, or it is marked twice
    // Code: VenueUnavailabilityService.handleVenueUnavailable
    it('affects pending requests too, but not rejected ones', async () => {
      await given('tc-s3-141b-setup'); // a pending and a rejected mainHall request

      const affected = await markUnavailable('mainHall');

      expect(affected.map((a) => a.bookingId).sort()).toEqual([ids.original, ids.pending].sort());
      const rejected = await prisma.venueBooking.findUniqueOrThrow({ where: { id: ids.rejected } });
      expect(rejected.replacementNeededAt).toBeNull();
    });

    // TC-S3-141 · US-52 AC-1 · setup: base-users + tc-s1-96-setup + tc-s3-141-setup + tc-s3-141c-setup · fails if the wrong bookings are marked as affected, the event or booking is changed, or it is marked twice
    // Code: VenueUnavailabilityService.handleVenueUnavailable
    it('leaves bookings outside the period, or at other venues, untouched', async () => {
      await given('tc-s3-141c-setup'); // mainHall on 5 Oct; eastHall in the period

      await markUnavailable('mainHall');

      for (const key of ['laterBooking', 'elsewhereBooking']) {
        const b = await prisma.venueBooking.findUniqueOrThrow({ where: { id: ids[key] } });
        expect(b.replacementNeededAt).toBeNull();
      }
    });

    // TC-S3-141 · US-52 AC-1 · setup: base-users + tc-s1-96-setup + tc-s3-141-setup · fails if the wrong bookings are marked as affected, the event or booking is changed, or it is marked twice
    // Code: VenueUnavailabilityService.handleVenueUnavailable
    it('does not mark or notify twice when called again', async () => {
      await markUnavailable('mainHall');
      const again = await unavailability.handleVenueUnavailable(ids.mainHall, PERIOD, REASON);

      expect(again).toEqual([]);
      expect(await notificationsOf('coordinator')).toHaveLength(1);
    });
  });

  describe('US-52 AC-1: the Coordinator is notified, with the reason', () => {
    // TC-S3-141 · US-52 AC-1 · setup: base-users + tc-s1-96-setup + tc-s3-141-setup · fails if the Coordinator is not told (with the event, venue, dates and reason), or someone else is
    // Code: VenueUnavailabilityService -> VENUE_UNAVAILABLE notice
    it('names the event, the venue, the affected dates and the reason', async () => {
      await markUnavailable('mainHall');

      const [notice] = await notificationsOf('coordinator');
      expect(notice.relatedEventId).toBe(ids.showcase);
      expect(notice.message).toBe(
        'mainHall is unavailable from 2030-09-30T00:00:00.000Z to 2030-10-02T00:00:00.000Z, ' +
          'affecting the booking for "showcase" on 2030-10-01T09:00:00.000Z – 2030-10-01T12:00:00.000Z. ' +
          `Reason: ${REASON}. The event has not been cancelled; request a replacement venue.`,
      );
    });

    // TC-S3-141 · US-52 AC-1 · setup: base-users + tc-s1-96-setup + tc-s3-141-setup + tc-s3-142-setup · fails if the Coordinator is not told (with the event, venue, dates and reason), or someone else is
    // Code: VenueUnavailabilityService -> VENUE_UNAVAILABLE notice
    it('notifies only the Coordinator of the affected event', async () => {
      await given('tc-s3-142-setup'); // another Coordinator's event at eastHall

      await markUnavailable('mainHall');

      expect(await notificationsOf('coordinator')).toHaveLength(1);
      expect(await notificationsOf('otherCoordinator')).toHaveLength(0);
      expect(
        await prisma.notification.count({ where: { type: NotificationType.VENUE_UNAVAILABLE } }),
      ).toBe(1);
    });

    // TC-S3-141 · US-52 AC-1 · setup: base-users + tc-s1-96-setup + tc-s3-141-setup + tc-s3-142b-setup · fails if the Coordinator is not told (with the event, venue, dates and reason), or someone else is
    // Code: VenueUnavailabilityService -> VENUE_UNAVAILABLE notice
    it('marks an event with no assigned Coordinator without error, and notifies no one', async () => {
      await given('tc-s3-142b-setup'); // an unassigned event's pending mainHall request

      const affected = await markUnavailable('mainHall');

      expect(affected.find((a) => a.bookingId === ids.unassignedBooking)).toMatchObject({
        coordinatorId: null,
      });
      const b = await prisma.venueBooking.findUniqueOrThrow({ where: { id: ids.unassignedBooking } });
      expect(b.replacementNeededAt).not.toBeNull();
      expect(
        await prisma.notification.count({ where: { type: NotificationType.VENUE_UNAVAILABLE } }),
      ).toBe(1); // the showcase Coordinator's only
    });
  });

  describe('US-52 AC-2: the affected event is flagged "Venue unavailable" for its Coordinator', () => {
    // TC-S3-142 · US-52 AC-2 · setup: base-users + tc-s1-96-setup + tc-s3-141-setup · fails if the affected event is not flagged for its Coordinator, or the list is shown to someone else
    // Code: GET /bookings/replacements-needed
    it('lists the affected booking with its event, venue, period and reason', async () => {
      await markUnavailable('mainHall');

      const res = await flagged().expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        id: ids.original,
        eventId: ids.showcase,
        event: expect.objectContaining({ name: 'showcase' }),
        venue: expect.objectContaining({ id: ids.mainHall }),
        unavailableFrom: PERIOD.start.toISOString(),
        unavailableUntil: PERIOD.end.toISOString(),
        unavailableReason: REASON,
        replacedByBookingId: null,
        replacementRequests: [],
      });
    });

    // TC-S3-142 · US-52 AC-2 · setup: base-users + tc-s1-96-setup + tc-s3-141-setup · fails if the affected event is not flagged for its Coordinator, or the list is shown to someone else
    // Code: GET /bookings/replacements-needed
    it('is empty for events that are not affected', async () => {
      await flagged().expect(200).expect([]);
    });

    // TC-S3-142 · US-52 AC-2 · setup: base-users + tc-s1-96-setup + tc-s3-141-setup · fails if the affected event is not flagged for its Coordinator, or the list is shown to someone else
    // Code: GET /bookings/replacements-needed
    it('is not shown to another Coordinator', async () => {
      await markUnavailable('mainHall');

      await flagged('otherCoordinator').expect(200).expect([]);
    });

    // TC-S3-142 · US-52 AC-2 · setup: base-users + tc-s1-96-setup + tc-s3-141-setup · fails if the affected event is not flagged for its Coordinator, or the list is shown to someone else
    // Code: GET /bookings/replacements-needed
    it.each(['staff', 'tech', 'organiser', 'attendee'])('is refused to %s (403)', async (who) => {
      await markUnavailable('mainHall');
      await flagged(who).expect(403);
    });
  });

  describe('US-52 AC-3: a replacement request from the affected event', () => {
    // TC-S3-143 · US-52 AC-3 · setup: base-users + tc-s1-96-setup + tc-s3-141-setup · fails if a replacement request is not linked or pre-filled, skips availability rules, or can replace the wrong booking
    // Code: BookingsService.request with replacesBookingId (findReplaceable)
    it('is an ordinary pending request, linked to the original, carrying its requirements', async () => {
      await markUnavailable('mainHall');

      const res = await requestReplacement({
        venueId: ids.eastHall,
        replacesBookingId: ids.original,
      }).expect(201);

      expect(res.body).toMatchObject({
        venueId: ids.eastHall,
        status: 'REQUESTED',
        replacesBookingId: ids.original,
        start: START,
        end: END,
        expectedAttendance: 80,
        // The original booking's requirements, not the event's later edit.
        preferredLayout: 'THEATRE',
        layoutNotes: 'Stage at the front.',
        accessibilityRequirements: ['STEP_FREE_ACCESS'],
        accessibilityNotes: 'Two wheelchair users.',
        equipmentNeeds: 'Two projectors.',
      });

      const flags = await flagged().expect(200);
      expect(flags.body[0].replacementRequests).toEqual([
        expect.objectContaining({ id: res.body.id, status: 'REQUESTED' }),
      ]);
    });

    // TC-S3-143 · US-52 AC-3 · setup: base-users + tc-s1-96-setup + tc-s3-141-setup · fails if a replacement request is not linked or pre-filled, skips availability rules, or can replace the wrong booking
    // Code: BookingsService.request with replacesBookingId (findReplaceable)
    it('can change the pre-filled timing and attendance', async () => {
      await markUnavailable('mainHall');

      const res = await http()
        .post('/bookings')
        .set('Authorization', as('coordinator'))
        .send({
          eventId: ids.showcase,
          venueId: ids.eastHall,
          start: '2030-10-01T08:00:00.000Z',
          end: '2030-10-01T13:00:00.000Z',
          expectedAttendance: 90,
          replacesBookingId: ids.original,
        })
        .expect(201);

      expect(res.body).toMatchObject({
        start: '2030-10-01T08:00:00.000Z',
        end: '2030-10-01T13:00:00.000Z',
        expectedAttendance: 90,
      });
    });

    // TC-S3-143 · US-52 AC-3 · setup: base-users + tc-s1-96-setup + tc-s3-141-setup · fails if a replacement request is not linked or pre-filled, skips availability rules, or can replace the wrong booking
    // Code: BookingsService.request with replacesBookingId (findReplaceable)
    it('uses the same availability rules: the unavailable venue is refused for the period', async () => {
      await markUnavailable('mainHall');

      // Same slot: the original still holds it until a replacement is confirmed.
      const sameSlot = await requestReplacement({
        venueId: ids.mainHall,
        replacesBookingId: ids.original,
      }).expect(409);
      expect(sameSlot.body.message).toBe(
        'the requested time overlaps a confirmed booking for this venue',
      );

      // A later slot inside the unavailable period: refused by the block.
      const res = await requestReplacement({
        venueId: ids.mainHall,
        replacesBookingId: ids.original,
        start: '2030-10-01T14:00:00.000Z',
        end: '2030-10-01T16:00:00.000Z',
      }).expect(409);

      expect(res.body.message).toBe('the requested time falls in a period blocked out for this venue');
    });

    // TC-S3-143 · US-52 AC-3 · setup: base-users + tc-s1-96-setup + tc-s3-141-setup + tc-s3-143b-setup · fails if a replacement request is not linked or pre-filled, skips availability rules, or can replace the wrong booking
    // Code: BookingsService.request with replacesBookingId (findReplaceable)
    it('refuses to replace a booking that was not marked, or one of another event', async () => {
      const notMarked = await requestReplacement({
        venueId: ids.eastHall,
        replacesBookingId: ids.original,
      }).expect(409);
      expect(notMarked.body.message).toBe(
        'that booking has not been marked as needing a replacement',
      );

      await given('tc-s3-143b-setup'); // the Coordinator's second event, "mine2"
      await markUnavailable('mainHall');
      const otherEvent = await requestReplacement(
        { venueId: ids.eastHall, replacesBookingId: ids.original },
        'coordinator',
        'mine2',
      ).expect(404);
      expect(otherEvent.body.message).toBe('booking to replace not found');
    });

    // TC-S3-143 · US-52 AC-3 · setup: base-users + tc-s1-96-setup + tc-s3-141-setup · fails if a replacement request is not linked or pre-filled, skips availability rules, or can replace the wrong booking
    // Code: BookingsService.request with replacesBookingId (findReplaceable)
    it("refuses another Coordinator's event (404) and other roles (403)", async () => {
      await markUnavailable('mainHall');

      await requestReplacement(
        { venueId: ids.eastHall, replacesBookingId: ids.original },
        'otherCoordinator',
      ).expect(404);
      await requestReplacement(
        { venueId: ids.eastHall, replacesBookingId: ids.original },
        'staff',
      ).expect(403);
      expect(await prisma.venueBooking.count({ where: { replacesBookingId: ids.original } })).toBe(0);
    });
  });

  describe('US-52 AC-4: the Coordinator selects a venue Venue Staff suggested', () => {
    // TC-S3-144 · US-52 AC-4 · setup: base-users + tc-s1-96-setup + tc-s3-141-setup · fails if selecting a suggested venue does not create a replacement request
    // Code: BookingSuggestionsService.accept on a booking needing replacement
    it('creates a replacement request that still needs approval', async () => {
      await markUnavailable('mainHall');
      // Venue Staff take the affected booking back with a suggestion (US-41).
      const reversed = await http()
        .post(`/bookings/${ids.original}/reverse`)
        .set('Authorization', as('staff'))
        .send({ reason: 'Main Hall flooded.', alternativeVenueIds: [ids.eastHall] })
        .expect(200);
      const suggestionId = reversed.body.decisions.at(-1).suggestions[0].id;

      const res = await http()
        .post(`/bookings/${ids.original}/suggestions/${suggestionId}/accept`)
        .set('Authorization', as('coordinator'))
        .expect(201);

      expect(res.body).toMatchObject({
        venueId: ids.eastHall,
        status: 'REQUESTED',
        replacesBookingId: ids.original,
      });
      // Selecting confirms nothing: the flag stays until Venue Staff approve.
      const flags = await flagged().expect(200);
      expect(flags.body.map((b: { id: string }) => b.id)).toEqual([ids.original]);
      expect(flags.body[0].decisions.at(-1).suggestions[0]).toMatchObject({
        venue: expect.objectContaining({ id: ids.eastHall }),
        acceptedBookingId: res.body.id,
      });

      // Approval confirms it and clears the flag.
      await decide(res.body.id, 'approve').expect(200);
      await flagged().expect(200).expect([]);
      const original = await prisma.venueBooking.findUniqueOrThrow({ where: { id: ids.original } });
      expect(original.replacedByBookingId).toBe(res.body.id);
    });
  });

  describe('US-52 AC-5: the original booking is released once a replacement is confirmed', () => {
    const replace = async () => {
      await markUnavailable('mainHall');
      const res = await requestReplacement({
        venueId: ids.eastHall,
        replacesBookingId: ids.original,
      }).expect(201);
      return res.body.id as string;
    };

    // TC-S3-145 · US-52 AC-5 · setup: base-users + tc-s1-96-setup + tc-s3-141-setup · fails if the original is not released when the replacement is confirmed, or is released too early, or another booking is released
    // Code: BookingsService decide (APPROVED) -> releaseReplaced
    it('releases the original on approval, keeping the record and linking it', async () => {
      const replacementId = await replace();

      await decide(replacementId, 'approve').expect(200);

      const original = await prisma.venueBooking.findUniqueOrThrow({ where: { id: ids.original } });
      expect(original).toMatchObject({
        status: BookingStatus.RELEASED,
        replacedByBookingId: replacementId,
        // The record and what it said are kept.
        venueId: ids.mainHall,
        start: new Date(START),
        end: new Date(END),
        unavailableReason: REASON,
      });
      expect(original.releasedAt).not.toBeNull();

      const replacement = await prisma.venueBooking.findUniqueOrThrow({ where: { id: replacementId } });
      expect(replacement).toMatchObject({
        status: BookingStatus.APPROVED,
        replacesBookingId: ids.original,
      });

      // The Coordinator can still open the original and see it was released.
      const view = await http()
        .get(`/bookings/${ids.original}`)
        .set('Authorization', as('coordinator'))
        .expect(200);
      expect(view.body).toMatchObject({ status: 'RELEASED', replacedByBookingId: replacementId });
    });

    // TC-S3-145 · US-52 AC-5 · setup: base-users + tc-s1-96-setup + tc-s3-141-setup · fails if the original is not released when the replacement is confirmed, or is released too early, or another booking is released
    // Code: BookingsService decide (APPROVED) -> releaseReplaced
    it('clears the "Venue unavailable" flag on confirmation', async () => {
      const replacementId = await replace();
      expect((await flagged().expect(200)).body).toHaveLength(1);

      await decide(replacementId, 'approve').expect(200);

      await flagged().expect(200).expect([]);
    });

    // TC-S3-145 · US-52 AC-5 · setup: base-users + tc-s1-96-setup + tc-s3-141-setup · fails if the original is not released when the replacement is confirmed, or is released too early, or another booking is released
    // Code: BookingsService decide (APPROVED) -> releaseReplaced
    it('does not release the original while the replacement is only requested', async () => {
      await replace();

      const original = await prisma.venueBooking.findUniqueOrThrow({ where: { id: ids.original } });
      expect(original.status).toBe(BookingStatus.APPROVED);
      expect(original.replacedByBookingId).toBeNull();
      expect(original.releasedAt).toBeNull();
    });

    // TC-S3-145 · US-52 AC-5 · setup: base-users + tc-s1-96-setup + tc-s3-141-setup + tc-s3-145-setup · fails if the original is not released when the replacement is confirmed, or is released too early, or another booking is released
    // Code: BookingsService decide (APPROVED) -> releaseReplaced
    it('keeps the original and the flag when the replacement is rejected, and allows another try', async () => {
      const first = await replace();

      await decide(first, 'reject', { reason: 'East Hall is closed that day.' }).expect(200);

      const original = await prisma.venueBooking.findUniqueOrThrow({ where: { id: ids.original } });
      expect(original.status).toBe(BookingStatus.APPROVED);
      expect(original.replacedByBookingId).toBeNull();
      expect((await flagged().expect(200)).body).toHaveLength(1);

      // Try again, at another venue.
      await given('tc-s3-145-setup'); // westHall
      const second = await requestReplacement({
        venueId: ids.westHall,
        replacesBookingId: ids.original,
      }).expect(201);
      await decide(second.body.id, 'approve').expect(200);

      const released = await prisma.venueBooking.findUniqueOrThrow({ where: { id: ids.original } });
      expect(released).toMatchObject({
        status: BookingStatus.RELEASED,
        replacedByBookingId: second.body.id,
      });
    });

    // TC-S3-145 · US-52 AC-5 · setup: base-users + tc-s1-96-setup + tc-s3-141-setup + tc-s3-145b-setup + tc-s3-145-setup · fails if the original is not released when the replacement is confirmed, or is released too early, or another booking is released
    // Code: BookingsService decide (APPROVED) -> releaseReplaced
    it("releases only the affected booking, never the event's other bookings", async () => {
      // The same event also holds eastHall for a breakout session.
      await given('tc-s3-145b-setup', 'tc-s3-145-setup'); // breakout at eastHall 13:00-15:00; westHall
      await markUnavailable('mainHall');

      const breakoutFlag = await prisma.venueBooking.findUniqueOrThrow({ where: { id: ids.breakout } });
      expect(breakoutFlag.replacementNeededAt).toBeNull();

      const res = await requestReplacement({
        venueId: ids.westHall,
        replacesBookingId: ids.original,
      }).expect(201);
      await decide(res.body.id, 'approve').expect(200);

      const breakout = await prisma.venueBooking.findUniqueOrThrow({ where: { id: ids.breakout } });
      expect(breakout).toMatchObject({
        status: BookingStatus.APPROVED,
        replacedByBookingId: null,
        releasedAt: null,
      });
      expect(
        (await prisma.venueBooking.findUniqueOrThrow({ where: { id: ids.original } })).status,
      ).toBe(BookingStatus.RELEASED);
    });

    // TC-S3-145 · US-52 AC-5 · setup: base-users + tc-s1-96-setup + tc-s3-141-setup · fails if the original is not released when the replacement is confirmed, or is released too early, or another booking is released
    // Code: BookingsService decide (APPROVED) -> releaseReplaced
    it('a released booking cannot be decided on again, and frees its slot', async () => {
      const replacementId = await replace();
      await decide(replacementId, 'approve').expect(200);

      await http()
        .post(`/bookings/${ids.original}/reverse`)
        .set('Authorization', as('staff'))
        .send({ reason: 'Undo.' })
        .expect(409);

      // The released booking no longer counts as holding mainHall.
      const live = await prisma.venueBooking.count({
        where: { venueId: ids.mainHall, status: { in: [BookingStatus.REQUESTED, BookingStatus.APPROVED] } },
      });
      expect(live).toBe(0);
    });

    // TC-S3-145 · US-52 AC-5 · setup: base-users + tc-s1-96-setup + tc-s3-141-setup · fails if the original is not released when the replacement is confirmed, or is released too early, or another booking is released
    // Code: BookingsService decide (APPROVED) -> releaseReplaced
    it('a later replacement once one is confirmed is refused', async () => {
      const replacementId = await replace();
      await decide(replacementId, 'approve').expect(200);

      const res = await requestReplacement({
        venueId: ids.eastHall,
        replacesBookingId: ids.original,
      }).expect(409);
      expect(res.body.message).toBe('a replacement for that booking has already been confirmed');
    });
  });
});
