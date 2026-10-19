import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AccessibilityFeature,
  BookingStatus,
  EventStatus,
  NotificationType,
  PrismaClient,
  Role,
  RoomLayout,
  VenueStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { VenueUnavailabilityService } from '../src/bookings/venue-unavailability.service';
import { listenOnLoopback } from './listen-on-loopback';

/**
 * US-52 e2e — a booked venue becomes unavailable, the Coordinator is told and
 * requests a replacement, and the original is released once the replacement
 * is confirmed. One describe per acceptance criterion, named "US-52 AC-n".
 *
 * #57 (Venue Staff marking a venue unavailable) is not built, so each test
 * records the unavailability directly — a US-16 blocked-out period — and calls
 * the hook #57 will call, VenueUnavailabilityService.handleVenueUnavailable.
 */
describe('US-52 unavailable venue replacement (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let unavailability: VenueUnavailabilityService;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

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

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: key, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  const seedVenue = async (key: string, managedBy = 'staff') => {
    const venue = await prisma.venue.create({
      data: {
        name: key,
        location: `${key} building`,
        capacity: 200,
        facilities: [],
        accessibilityFeatures: [AccessibilityFeature.STEP_FREE_ACCESS],
        supportedLayouts: [RoomLayout.THEATRE],
        status: VenueStatus.PUBLISHED,
        managedById: ids[managedBy],
      },
    });
    ids[key] = venue.id;
  };

  const seedEvent = async (key: string, coordinator: string | null = 'coordinator') => {
    const event = await prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        coordinatorId: coordinator ? ids[coordinator] : null,
        name: key,
        purpose: 'p',
        description: 'd',
        category: 'c',
        proposedStart: new Date(START),
        proposedEnd: new Date(END),
        expectedAttendance: 80,
        preferredLayout: RoomLayout.THEATRE,
        accessibilityRequirements: [AccessibilityFeature.STEP_FREE_ACCESS],
        equipmentNeeds: 'Edited on the event after booking.',
        status: EventStatus.PLANNING,
      },
    });
    ids[key] = event.id;
    return event;
  };

  const seedBooking = async (
    key: string,
    event: string,
    venue: string,
    status: BookingStatus = BookingStatus.APPROVED,
    start = START,
    end = END,
  ) => {
    const booking = await prisma.venueBooking.create({
      data: {
        eventId: ids[event],
        venueId: ids[venue],
        start: new Date(start),
        end: new Date(end),
        status,
        expectedAttendance: 80,
        requestedById: ids.coordinator,
        preferredLayout: RoomLayout.THEATRE,
        layoutNotes: 'Stage at the front.',
        accessibilityRequirements: [AccessibilityFeature.STEP_FREE_ACCESS],
        accessibilityNotes: 'Two wheelchair users.',
        equipmentNeeds: 'Two projectors.',
      },
    });
    ids[key] = booking.id;
    return booking;
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

  const clear = async () => {
    await prisma.notification.deleteMany();
    await prisma.bookingSuggestion.deleteMany();
    await prisma.bookingDecision.deleteMany();
    // Replacement links point between bookings; drop them before the rows.
    await prisma.venueBooking.updateMany({
      data: { replacesBookingId: null, replacedByBookingId: null },
    });
    await prisma.venueBooking.deleteMany();
    await prisma.venueBlock.deleteMany();
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
    unavailability = app.get(VenueUnavailabilityService);
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
    await seedUser('otherCoordinator', 'other.coordinator@example.com', Role.EVENT_COORDINATOR);
    await seedUser('staff', 'staff@example.com', Role.VENUE_STAFF);
    await seedUser('otherStaff', 'other.staff@example.com', Role.VENUE_STAFF);
    await seedUser('tech', 'tech@example.com', Role.TECHNICAL_SUPPORT_STAFF);
    await seedUser('attendee', 'attendee@example.com', Role.ATTENDEE);

    // mainHall becomes unavailable; eastHall is where replacements go.
    await seedVenue('mainHall');
    await seedVenue('eastHall', 'otherStaff');

    await seedEvent('showcase');
    await seedBooking('original', 'showcase', 'mainHall');
  });

  describe('US-52 trigger: affected bookings are identified, nothing else changes', () => {
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

    it('affects pending requests too, but not rejected ones', async () => {
      await seedEvent('pendingEvent');
      await seedBooking('pending', 'pendingEvent', 'mainHall', BookingStatus.REQUESTED);
      await seedEvent('rejectedEvent');
      await seedBooking('rejected', 'rejectedEvent', 'mainHall', BookingStatus.REJECTED);

      const affected = await markUnavailable('mainHall');

      expect(affected.map((a) => a.bookingId).sort()).toEqual([ids.original, ids.pending].sort());
      const rejected = await prisma.venueBooking.findUniqueOrThrow({ where: { id: ids.rejected } });
      expect(rejected.replacementNeededAt).toBeNull();
    });

    it('leaves bookings outside the period, or at other venues, untouched', async () => {
      await seedEvent('later');
      await seedBooking('laterBooking', 'later', 'mainHall', BookingStatus.APPROVED,
        '2030-10-05T09:00:00.000Z', '2030-10-05T12:00:00.000Z');
      await seedEvent('elsewhere');
      await seedBooking('elsewhereBooking', 'elsewhere', 'eastHall');

      await markUnavailable('mainHall');

      for (const key of ['laterBooking', 'elsewhereBooking']) {
        const b = await prisma.venueBooking.findUniqueOrThrow({ where: { id: ids[key] } });
        expect(b.replacementNeededAt).toBeNull();
      }
    });

    it('does not mark or notify twice when called again', async () => {
      await markUnavailable('mainHall');
      const again = await unavailability.handleVenueUnavailable(ids.mainHall, PERIOD, REASON);

      expect(again).toEqual([]);
      expect(await notificationsOf('coordinator')).toHaveLength(1);
    });
  });

  describe('US-52 AC-1: the Coordinator is notified, with the reason', () => {
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

    it('notifies only the Coordinator of the affected event', async () => {
      await seedEvent('otherEvent', 'otherCoordinator');
      await seedBooking('otherBooking', 'otherEvent', 'eastHall');

      await markUnavailable('mainHall');

      expect(await notificationsOf('coordinator')).toHaveLength(1);
      expect(await notificationsOf('otherCoordinator')).toHaveLength(0);
      expect(
        await prisma.notification.count({ where: { type: NotificationType.VENUE_UNAVAILABLE } }),
      ).toBe(1);
    });

    it('marks an event with no assigned Coordinator without error, and notifies no one', async () => {
      await seedEvent('unassigned', null);
      await seedBooking('unassignedBooking', 'unassigned', 'mainHall', BookingStatus.REQUESTED);

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

    it('is empty for events that are not affected', async () => {
      await flagged().expect(200).expect([]);
    });

    it('is not shown to another Coordinator', async () => {
      await markUnavailable('mainHall');

      await flagged('otherCoordinator').expect(200).expect([]);
    });

    it.each(['staff', 'tech', 'organiser', 'attendee'])('is refused to %s (403)', async (who) => {
      await markUnavailable('mainHall');
      await flagged(who).expect(403);
    });
  });

  describe('US-52 AC-3: a replacement request from the affected event', () => {
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

    it('refuses to replace a booking that was not marked, or one of another event', async () => {
      const notMarked = await requestReplacement({
        venueId: ids.eastHall,
        replacesBookingId: ids.original,
      }).expect(409);
      expect(notMarked.body.message).toBe(
        'that booking has not been marked as needing a replacement',
      );

      await seedEvent('mine2');
      await markUnavailable('mainHall');
      const otherEvent = await requestReplacement(
        { venueId: ids.eastHall, replacesBookingId: ids.original },
        'coordinator',
        'mine2',
      ).expect(404);
      expect(otherEvent.body.message).toBe('booking to replace not found');
    });

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

    it('clears the "Venue unavailable" flag on confirmation', async () => {
      const replacementId = await replace();
      expect((await flagged().expect(200)).body).toHaveLength(1);

      await decide(replacementId, 'approve').expect(200);

      await flagged().expect(200).expect([]);
    });

    it('does not release the original while the replacement is only requested', async () => {
      await replace();

      const original = await prisma.venueBooking.findUniqueOrThrow({ where: { id: ids.original } });
      expect(original.status).toBe(BookingStatus.APPROVED);
      expect(original.replacedByBookingId).toBeNull();
      expect(original.releasedAt).toBeNull();
    });

    it('keeps the original and the flag when the replacement is rejected, and allows another try', async () => {
      const first = await replace();

      await decide(first, 'reject', { reason: 'East Hall is closed that day.' }).expect(200);

      const original = await prisma.venueBooking.findUniqueOrThrow({ where: { id: ids.original } });
      expect(original.status).toBe(BookingStatus.APPROVED);
      expect(original.replacedByBookingId).toBeNull();
      expect((await flagged().expect(200)).body).toHaveLength(1);

      // Try again, at another venue.
      await seedVenue('westHall', 'otherStaff');
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

    it("releases only the affected booking, never the event's other bookings", async () => {
      // The same event also holds eastHall for a breakout session.
      await seedBooking('breakout', 'showcase', 'eastHall', BookingStatus.APPROVED,
        '2030-10-01T13:00:00.000Z', '2030-10-01T15:00:00.000Z');
      await seedVenue('westHall', 'otherStaff');
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
