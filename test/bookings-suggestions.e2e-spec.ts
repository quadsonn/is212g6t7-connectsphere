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
import { listenOnLoopback } from './listen-on-loopback';

/**
 * US-41 e2e — Venue Staff suggest alternative venues when a booking request
 * can't be fulfilled. One describe per acceptance criterion, named
 * "US-41 AC-n" for traceability.
 */
describe('US-41 suggest an alternative venue (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  // The rejected request's slot.
  const START = '2030-10-01T09:00:00.000Z';
  const END = '2030-10-01T12:00:00.000Z';

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const reject = (id: string, body: object, who = 'staff') =>
    http().post(`/bookings/${id}/reject`).set('Authorization', as(who)).send(body);
  const alternatives = (id: string, who = 'staff') =>
    http().get(`/bookings/${id}/alternatives`).set('Authorization', as(who));
  const accept = (id: string, suggestionId: string, who = 'coordinator') =>
    http()
      .post(`/bookings/${id}/suggestions/${suggestionId}/accept`)
      .set('Authorization', as(who));
  const getBooking = (id: string, who = 'coordinator') =>
    http().get(`/bookings/${id}`).set('Authorization', as(who));

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: key, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  const seedVenue = async (
    key: string,
    overrides: {
      capacity?: number | null;
      accessibilityFeatures?: AccessibilityFeature[];
      supportedLayouts?: RoomLayout[];
      status?: VenueStatus;
      managedBy?: string;
    } = {},
  ) => {
    const venue = await prisma.venue.create({
      data: {
        name: key,
        location: `${key} building`,
        capacity: overrides.capacity === undefined ? 200 : overrides.capacity,
        facilities: [],
        accessibilityFeatures: overrides.accessibilityFeatures ?? [],
        supportedLayouts: overrides.supportedLayouts ?? [],
        status: overrides.status ?? VenueStatus.PUBLISHED,
        managedById: ids[overrides.managedBy ?? 'staff'],
      },
    });
    ids[key] = venue.id;
    return venue;
  };

  const seedEvent = (name: string, coordinator = 'coordinator') =>
    prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        coordinatorId: ids[coordinator],
        name,
        purpose: 'p',
        description: 'd',
        category: 'c',
        proposedStart: new Date(START),
        proposedEnd: new Date(END),
        expectedAttendance: 80,
        preferredLayout: RoomLayout.THEATRE,
        accessibilityRequirements: [AccessibilityFeature.STEP_FREE_ACCESS],
        equipmentNeeds: 'Event-level needs, edited after the request.',
        status: EventStatus.PLANNING,
      },
    });

  /** The request Venue Staff are deciding: Main Hall, 80 people, theatre, step-free. */
  const seedRequest = async (status: BookingStatus = BookingStatus.REQUESTED) => {
    const event = await seedEvent('Showcase');
    ids.event = event.id;
    return prisma.venueBooking.create({
      data: {
        eventId: event.id,
        venueId: ids.mainHall,
        start: new Date(START),
        end: new Date(END),
        expectedAttendance: 80,
        requestedById: ids.coordinator,
        status,
        preferredLayout: RoomLayout.THEATRE,
        layoutNotes: 'Stage at the front.',
        accessibilityRequirements: [AccessibilityFeature.STEP_FREE_ACCESS],
        accessibilityNotes: 'Two wheelchair users.',
        equipmentNeeds: 'Two projectors.',
      },
    });
  };

  /** Another event holding `venue` over the slot, with the given status. */
  const occupy = async (venue: string, status: BookingStatus) => {
    const other = await seedEvent(`Other at ${venue}`);
    await prisma.venueBooking.create({
      data: {
        eventId: other.id,
        venueId: ids[venue],
        start: new Date('2030-10-01T10:00:00Z'),
        end: new Date('2030-10-01T11:00:00Z'),
        expectedAttendance: 10,
        status,
      },
    });
  };

  const clear = async () => {
    await prisma.notification.deleteMany();
    await prisma.bookingSuggestion.deleteMany();
    await prisma.bookingDecision.deleteMany();
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

    await seedVenue('mainHall');
    // A good fit managed by someone else: suggestions are not limited to the
    // rejecting staff member's own venues.
    await seedVenue('eastHall', {
      capacity: 100,
      accessibilityFeatures: [AccessibilityFeature.STEP_FREE_ACCESS],
      supportedLayouts: [RoomLayout.THEATRE],
      managedBy: 'otherStaff',
    });
  });

  describe('US-41 AC-1: rejecting can attach one or more alternative venues', () => {
    it('records the rejection with the venues attached', async () => {
      await seedVenue('westHall', {
        capacity: 150,
        accessibilityFeatures: [AccessibilityFeature.STEP_FREE_ACCESS],
      });
      const booking = await seedRequest();

      const res = await reject(booking.id, {
        reason: 'Main Hall is closed for repairs.',
        alternativeVenueIds: [ids.eastHall, ids.westHall],
      }).expect(200);

      expect(res.body.status).toBe('REJECTED');
      const decision = res.body.decisions.at(-1);
      expect(decision.suggestions.map((s: { venue: { id: string } }) => s.venue.id)).toEqual([
        ids.eastHall,
        ids.westHall,
      ]);
      // Readable IDs (CLAUDE.md, "IDs"): BSG-, consecutive within one rejection.
      const [first, second] = decision.suggestions.map((s: { id: string }) => s.id);
      expect(first).toMatch(/^BSG-\d{3,}$/);
      expect(Number(second.slice(4))).toBe(Number(first.slice(4)) + 1);
    });

    it('still rejects without alternatives, as before', async () => {
      const booking = await seedRequest();

      const res = await reject(booking.id, { reason: 'No.' }).expect(200);

      expect(res.body.decisions.at(-1).suggestions).toEqual([]);
      expect(await prisma.bookingSuggestion.count()).toBe(0);
    });

    it('refuses the same venue twice, a non-list, and too many', async () => {
      const booking = await seedRequest();

      await reject(booking.id, {
        reason: 'r',
        alternativeVenueIds: [ids.eastHall, ids.eastHall],
      }).expect(400);
      await reject(booking.id, { reason: 'r', alternativeVenueIds: ids.eastHall }).expect(400);
      await reject(booking.id, {
        reason: 'r',
        alternativeVenueIds: Array.from({ length: 11 }, (_, i) => `v${i}`),
      }).expect(400);

      expect((await prisma.venueBooking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
        BookingStatus.REQUESTED,
      );
    });

    it('can be attached when a reversal rejects an approved booking, but not to an approval', async () => {
      const approved = await seedRequest(BookingStatus.APPROVED);

      const res = await http()
        .post(`/bookings/${approved.id}/reverse`)
        .set('Authorization', as('staff'))
        .send({ reason: 'Hall unavailable after all.', alternativeVenueIds: [ids.eastHall] })
        .expect(200);
      expect(res.body.status).toBe('REJECTED');
      expect(res.body.decisions.at(-1)).toMatchObject({
        kind: 'REVERSAL',
        suggestions: [expect.objectContaining({ venue: expect.objectContaining({ id: ids.eastHall }) })],
      });

      const back = await http()
        .post(`/bookings/${approved.id}/reverse`)
        .set('Authorization', as('staff'))
        .send({ reason: 'Fixed.', alternativeVenueIds: [ids.eastHall] })
        .expect(400);
      expect(back.body.message).toBe(
        'alternative venues can only be suggested when rejecting a request',
      );
    });

    it.each([
      ['otherStaff', 404],
      ['coordinator', 403],
      ['tech', 403],
    ])('is refused to %s (%i)', async (who, status) => {
      const booking = await seedRequest();

      await reject(booking.id, { reason: 'r', alternativeVenueIds: [ids.eastHall] }, who).expect(
        status,
      );
      expect(await prisma.bookingSuggestion.count()).toBe(0);
    });
  });

  describe('US-41 AC-2: the system proposes candidates ranked by how well they match', () => {
    it('proposes only free venues that meet capacity and accessibility, best match first', async () => {
      // Fits, theatre, step-free, closest capacity — ranked first.
      // eastHall (seeded): capacity 100, theatre, step-free.
      await seedVenue('bigHall', {
        capacity: 500,
        accessibilityFeatures: [AccessibilityFeature.STEP_FREE_ACCESS],
        supportedLayouts: [RoomLayout.THEATRE],
      });
      // Fits but no theatre layout — after every layout match.
      await seedVenue('flatHall', {
        capacity: 90,
        accessibilityFeatures: [AccessibilityFeature.STEP_FREE_ACCESS],
      });
      // Excluded: too small; no step-free access; approved booking; blocked;
      // unpublished.
      await seedVenue('tinyRoom', {
        capacity: 20,
        accessibilityFeatures: [AccessibilityFeature.STEP_FREE_ACCESS],
      });
      await seedVenue('stairsHall', { capacity: 200 });
      await seedVenue('bookedHall', {
        accessibilityFeatures: [AccessibilityFeature.STEP_FREE_ACCESS],
      });
      await seedVenue('blockedHall', {
        accessibilityFeatures: [AccessibilityFeature.STEP_FREE_ACCESS],
      });
      await seedVenue('draftHall', {
        accessibilityFeatures: [AccessibilityFeature.STEP_FREE_ACCESS],
        status: VenueStatus.DRAFT,
      });
      // Free: only a pending request overlaps — tentative, not a booking.
      await seedVenue('pendingHall', {
        capacity: 300,
        accessibilityFeatures: [AccessibilityFeature.STEP_FREE_ACCESS],
        supportedLayouts: [RoomLayout.THEATRE],
      });

      const booking = await seedRequest();
      await occupy('bookedHall', BookingStatus.APPROVED);
      await occupy('pendingHall', BookingStatus.REQUESTED);
      await prisma.venueBlock.create({
        data: {
          venueId: ids.blockedHall,
          start: new Date('2030-10-01T11:00:00Z'),
          end: new Date('2030-10-01T15:00:00Z'),
          reason: 'Maintenance',
          createdById: ids.staff,
        },
      });

      const res = await alternatives(booking.id).expect(200);

      expect(res.body).toMatchObject({
        bookingId: booking.id,
        start: START,
        end: END,
        expectedAttendance: 80,
      });
      expect(res.body.candidates.map((c: { name: string }) => c.name)).toEqual([
        'eastHall',
        'pendingHall',
        'bigHall',
        'flatHall',
      ]);
      expect(res.body.candidates[0]).toEqual({
        venueId: ids.eastHall,
        name: 'eastHall',
        location: 'eastHall building',
        capacity: 100,
        spareCapacity: 20,
        layout: 'MET',
      });
    });

    it('never proposes the venue the request asked for', async () => {
      await prisma.venue.update({
        where: { id: ids.mainHall },
        data: {
          accessibilityFeatures: [AccessibilityFeature.STEP_FREE_ACCESS],
          supportedLayouts: [RoomLayout.THEATRE],
        },
      });
      const booking = await seedRequest();

      const res = await alternatives(booking.id).expect(200);

      expect(res.body.candidates.map((c: { venueId: string }) => c.venueId)).not.toContain(
        ids.mainHall,
      );
    });

    it('allows a booking ending exactly when the slot starts (back-to-back)', async () => {
      const booking = await seedRequest();
      const other = await seedEvent('Morning');
      await prisma.venueBooking.create({
        data: {
          eventId: other.id,
          venueId: ids.eastHall,
          start: new Date('2030-10-01T07:00:00Z'),
          end: new Date(START),
          expectedAttendance: 10,
          status: BookingStatus.APPROVED,
        },
      });

      const res = await alternatives(booking.id).expect(200);

      expect(res.body.candidates.map((c: { venueId: string }) => c.venueId)).toContain(
        ids.eastHall,
      );
    });

    it.each([
      ['otherStaff', 404],
      ['coordinator', 403],
      ['organiser', 403],
    ])('is refused to %s (%i)', async (who, status) => {
      const booking = await seedRequest();
      await alternatives(booking.id, who).expect(status);
    });
  });

  describe('US-41 AC-3: Venue Staff pick from the candidates or choose another venue manually', () => {
    it('accepts a free venue that was not among the candidates', async () => {
      // Big enough and free, but no step-free access, so not proposed: a
      // manual choice. (Capacity AC-3: a venue too small is not — see below.)
      await seedVenue('stairsHall', { capacity: 120 });
      const booking = await seedRequest();

      const proposed = await alternatives(booking.id).expect(200);
      expect(proposed.body.candidates.map((c: { venueId: string }) => c.venueId)).not.toContain(
        ids.stairsHall,
      );
      expect(proposed.body.others.map((v: { venueId: string }) => v.venueId)).toContain(
        ids.stairsHall,
      );

      const res = await reject(booking.id, {
        reason: 'Main Hall unavailable; the stairs hall has the room, though not step-free.',
        alternativeVenueIds: [ids.eastHall, ids.stairsHall],
      }).expect(200);

      expect(
        res.body.decisions.at(-1).suggestions.map((s: { venue: { id: string } }) => s.venue.id),
      ).toEqual([ids.eastHall, ids.stairsHall]);
    });

    it('refuses an unknown or unpublished venue, or the requested venue itself', async () => {
      await seedVenue('draftHall', { status: VenueStatus.DRAFT });
      const booking = await seedRequest();

      const unknown = await reject(booking.id, {
        reason: 'r',
        alternativeVenueIds: ['no-such-venue'],
      }).expect(400);
      expect(unknown.body.message).toBe('suggested venue not found: no-such-venue');

      await reject(booking.id, { reason: 'r', alternativeVenueIds: [ids.draftHall] }).expect(400);

      const self = await reject(booking.id, {
        reason: 'r',
        alternativeVenueIds: [ids.mainHall],
      }).expect(400);
      expect(self.body.message).toBe(
        'the venue this request asked for cannot be suggested as its alternative',
      );
    });
  });

  describe("US-41 AC-4: venues that aren't free for the slot can't be suggested", () => {
    it.each([
      ['an approved booking', 'approved'],
      ['a blocked-out period', 'blocked'],
    ])('refuses a venue held by %s, and records nothing', async (_label, kind) => {
      const booking = await seedRequest();
      if (kind === 'approved') {
        await occupy('eastHall', BookingStatus.APPROVED);
      } else {
        await prisma.venueBlock.create({
          data: {
            venueId: ids.eastHall,
            start: new Date('2030-10-01T08:00:00Z'),
            end: new Date('2030-10-01T10:00:00Z'),
            reason: 'Deep clean',
            createdById: ids.otherStaff,
          },
        });
      }

      const res = await reject(booking.id, {
        reason: 'Main Hall unavailable.',
        alternativeVenueIds: [ids.eastHall],
      }).expect(409);

      expect(res.body.message).toBe(
        'eastHall is not free for the requested time, so it cannot be suggested',
      );
      // The whole rejection is refused, so staff can choose again.
      const stored = await prisma.venueBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(stored.status).toBe(BookingStatus.REQUESTED);
      expect(await prisma.bookingDecision.count()).toBe(0);
      expect(await prisma.bookingSuggestion.count()).toBe(0);
    });

    it('allows a venue with only a pending request overlapping — it is not booked', async () => {
      const booking = await seedRequest();
      await occupy('eastHall', BookingStatus.REQUESTED);

      await reject(booking.id, { reason: 'r', alternativeVenueIds: [ids.eastHall] }).expect(200);
    });
  });

  describe('US-41 AC-5: the Coordinator sees the suggestions on the rejected request, with the reason', () => {
    it('shows the reason and the suggested venues on the request', async () => {
      const booking = await seedRequest();
      await reject(booking.id, {
        reason: 'Main Hall is closed for repairs.',
        alternativeVenueIds: [ids.eastHall],
      }).expect(200);

      const res = await getBooking(booking.id).expect(200);

      expect(res.body.status).toBe('REJECTED');
      expect(res.body.decisionReason).toBe('Main Hall is closed for repairs.');
      expect(res.body.decisions.at(-1).suggestions).toEqual([
        {
          id: expect.any(String),
          venue: { id: ids.eastHall, name: 'eastHall', location: 'eastHall building', capacity: 100 },
          acceptedBookingId: null,
          acceptedAt: null,
          createdAt: expect.any(String),
        },
      ]);
    });

    it('names the suggestions in the rejection notification', async () => {
      const booking = await seedRequest();
      await reject(booking.id, {
        reason: 'Closed for repairs.',
        alternativeVenueIds: [ids.eastHall],
      }).expect(200);

      const notice = await prisma.notification.findFirstOrThrow({
        where: { recipientId: ids.coordinator, type: NotificationType.VENUE_BOOKING_DECIDED },
      });
      expect(notice.message).toBe(
        'the booking of mainHall for "Showcase" was rejected. Reason: Closed for repairs. Alternative venues suggested: eastHall.',
      );
    });

    it('is not shown to another Coordinator', async () => {
      const booking = await seedRequest();
      await reject(booking.id, { reason: 'r', alternativeVenueIds: [ids.eastHall] }).expect(200);

      await getBooking(booking.id, 'otherCoordinator').expect(404);
    });
  });

  describe('US-41 AC-6: accepting a suggestion creates a new request, pre-filled with the original details', () => {
    const rejectWithEastHall = async () => {
      const booking = await seedRequest();
      const res = await reject(booking.id, {
        reason: 'Closed.',
        alternativeVenueIds: [ids.eastHall],
      }).expect(200);
      return { booking, suggestionId: res.body.decisions.at(-1).suggestions[0].id as string };
    };

    it('creates a pending request for the suggested venue with the original time, attendance and requirements', async () => {
      const { booking, suggestionId } = await rejectWithEastHall();

      const res = await accept(booking.id, suggestionId).expect(201);

      expect(res.body).toMatchObject({
        eventId: ids.event,
        venueId: ids.eastHall,
        start: START,
        end: END,
        expectedAttendance: 80,
        // US-21 AC-3: a request, not a booking — Venue Staff still decide.
        status: 'REQUESTED',
        requestedBy: expect.objectContaining({ id: ids.coordinator }),
        // From the original request, not the event's later edits.
        preferredLayout: 'THEATRE',
        layoutNotes: 'Stage at the front.',
        accessibilityRequirements: ['STEP_FREE_ACCESS'],
        accessibilityNotes: 'Two wheelchair users.',
        equipmentNeeds: 'Two projectors.',
      });

      // The original is untouched; the suggestion records what it became.
      const original = await prisma.venueBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(original.status).toBe(BookingStatus.REJECTED);
      const suggestion = await prisma.bookingSuggestion.findUniqueOrThrow({
        where: { id: suggestionId },
      });
      expect(suggestion.acceptedBookingId).toBe(res.body.id);
      expect(suggestion.acceptedAt).not.toBeNull();
    });

    it('cannot accept the same suggestion twice', async () => {
      const { booking, suggestionId } = await rejectWithEastHall();
      await accept(booking.id, suggestionId).expect(201);

      const again = await accept(booking.id, suggestionId).expect(409);

      expect(again.body.message).toBe('this suggestion has already been accepted');
      expect(await prisma.venueBooking.count({ where: { venueId: ids.eastHall } })).toBe(1);
    });

    it('goes through the normal request checks: refused if the venue was booked meanwhile', async () => {
      const { booking, suggestionId } = await rejectWithEastHall();
      await occupy('eastHall', BookingStatus.APPROVED);

      const res = await accept(booking.id, suggestionId).expect(409);

      expect(res.body.message).toBe('the requested time overlaps a confirmed booking for this venue');
      expect(
        (await prisma.bookingSuggestion.findUniqueOrThrow({ where: { id: suggestionId } }))
          .acceptedBookingId,
      ).toBeNull();
    });

    it('is refused once a reversal has approved the original', async () => {
      const { booking, suggestionId } = await rejectWithEastHall();
      await http()
        .post(`/bookings/${booking.id}/reverse`)
        .set('Authorization', as('staff'))
        .send({ reason: 'Repairs finished early.' })
        .expect(200);

      const res = await accept(booking.id, suggestionId).expect(409);
      expect(res.body.message).toBe('suggestions can only be accepted on a rejected request');
    });

    it('404s for a suggestion of another request, or another Coordinator', async () => {
      const { booking, suggestionId } = await rejectWithEastHall();

      await accept('another-booking', suggestionId).expect(404);
      await accept(booking.id, suggestionId, 'otherCoordinator').expect(404);
    });

    it.each(['staff', 'organiser', 'tech'])('is refused to %s (403)', async (who) => {
      const { booking, suggestionId } = await rejectWithEastHall();
      await accept(booking.id, suggestionId, who).expect(403);
    });
  });

  describe("US-41 AC-7: suggestions are recorded in the request's history", () => {
    it('keeps each decision with its own suggestions, oldest first', async () => {
      await seedVenue('westHall', {
        capacity: 150,
        accessibilityFeatures: [AccessibilityFeature.STEP_FREE_ACCESS],
      });
      const booking = await seedRequest();
      await reject(booking.id, { reason: 'Closed.', alternativeVenueIds: [ids.eastHall] }).expect(
        200,
      );
      await http()
        .post(`/bookings/${booking.id}/reverse`)
        .set('Authorization', as('staff'))
        .send({ reason: 'Reopened.' })
        .expect(200);
      await http()
        .post(`/bookings/${booking.id}/reverse`)
        .set('Authorization', as('staff'))
        .send({ reason: 'Closed again.', alternativeVenueIds: [ids.westHall] })
        .expect(200);

      const res = await getBooking(booking.id, 'staff').expect(200);

      expect(
        res.body.decisions.map(
          (d: { outcome: string; reason: string; suggestions: { venue: { id: string } }[] }) => [
            d.outcome,
            d.reason,
            d.suggestions.map((s) => s.venue.id),
          ],
        ),
      ).toEqual([
        ['REJECTED', 'Closed.', [ids.eastHall]],
        ['APPROVED', 'Reopened.', []],
        ['REJECTED', 'Closed again.', [ids.westHall]],
      ]);
      expect(res.body.decisions[0].decidedBy).toMatchObject({ id: ids.staff });
    });
  });

  describe('Capacity AC-3: Venue Staff can only suggest venues that are free and big enough', () => {
    const ids_of = (list: { venueId: string }[]) => list.map((v) => v.venueId);

    it('Capacity AC-3: the list excludes venues too small for the expected attendance', async () => {
      // The request is for 80 people.
      await seedVenue('seminarRoom', { capacity: 40 });
      await seedVenue('exactRoom', { capacity: 80 });
      const booking = await seedRequest();

      const res = await alternatives(booking.id).expect(200);
      const offered = [...ids_of(res.body.candidates), ...ids_of(res.body.others)];

      expect(offered).not.toContain(ids.seminarRoom);
      // Equal attendance and capacity fits.
      expect(offered).toContain(ids.exactRoom);
    });

    it('Capacity AC-3: the list excludes venues that are not free, including within setup or turnaround time', async () => {
      // Big enough, but booked over the slot, blocked out, or (US-50) still
      // turning around after a booking that ends 30 minutes before it.
      await seedVenue('bookedHall');
      await seedVenue('blockedHall');
      await seedVenue('turnaroundHall');
      await prisma.venue.update({
        where: { id: ids.turnaroundHall },
        data: { turnaroundMinutes: 60 },
      });
      const booking = await seedRequest();
      await occupy('bookedHall', BookingStatus.APPROVED);
      await prisma.venueBlock.create({
        data: {
          venueId: ids.blockedHall,
          start: new Date('2030-10-01T11:00:00Z'),
          end: new Date('2030-10-01T15:00:00Z'),
          reason: 'Maintenance',
          createdById: ids.staff,
        },
      });
      const morning = await seedEvent('Morning');
      await prisma.venueBooking.create({
        data: {
          eventId: morning.id,
          venueId: ids.turnaroundHall,
          start: new Date('2030-10-01T07:00:00Z'),
          end: new Date('2030-10-01T08:30:00Z'),
          expectedAttendance: 10,
          status: BookingStatus.APPROVED,
        },
      });

      const res = await alternatives(booking.id).expect(200);
      const offered = [...ids_of(res.body.candidates), ...ids_of(res.body.others)];

      expect(offered).not.toContain(ids.bookedHall);
      expect(offered).not.toContain(ids.blockedHall);
      expect(offered).not.toContain(ids.turnaroundHall);

      // The server holds the same line if the venue is sent anyway.
      await reject(booking.id, {
        reason: 'r',
        alternativeVenueIds: [ids.turnaroundHall],
      }).expect(409);
    });

    it('Capacity AC-3: the server refuses an under-capacity venue even when the page is bypassed, and records nothing', async () => {
      await seedVenue('alumniLounge', { capacity: 40 });
      const booking = await seedRequest();

      const res = await reject(booking.id, {
        reason: 'Main Hall is closed.',
        alternativeVenueIds: [ids.eastHall, ids.alumniLounge],
      }).expect(409);

      expect(res.body).toMatchObject({
        code: 'CAPACITY_EXCEEDED',
        message: 'alumniLounge holds 40, but expected attendance is 80. It cannot be suggested.',
        venueId: ids.alumniLounge,
      });
      // The whole rejection is refused, as for any unfit suggestion (AC-4).
      const after = await prisma.venueBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(after.status).toBe(BookingStatus.REQUESTED);
      expect(await prisma.bookingSuggestion.count()).toBe(0);
    });

    it('Capacity AC-3: the same check applies when a reversal (US-52) suggests venues', async () => {
      await seedVenue('alumniLounge', { capacity: 40 });
      const booking = await seedRequest(BookingStatus.APPROVED);

      const res = await http()
        .post(`/bookings/${booking.id}/reverse`)
        .set('Authorization', as('staff'))
        .send({ reason: 'Flooded.', alternativeVenueIds: [ids.alumniLounge] })
        .expect(409);

      expect(res.body.code).toBe('CAPACITY_EXCEEDED');
    });

    it('Capacity AC-4: nothing is offered when no free venue is big enough', async () => {
      await prisma.venue.update({ where: { id: ids.eastHall }, data: { capacity: 40 } });
      await seedVenue('seminarRoom', { capacity: 60 });
      const booking = await seedRequest();

      const res = await alternatives(booking.id).expect(200);

      expect(res.body).toMatchObject({ expectedAttendance: 80, candidates: [], others: [] });
    });
  });

  describe('Capacity AC-1/AC-2: the Coordinator cannot request a suggested venue that is too small', () => {
    it('Capacity AC-1/AC-2: refuses accepting a suggestion whose venue no longer holds the attendance', async () => {
      const booking = await seedRequest();
      const rejected = await reject(booking.id, {
        reason: 'Closed.',
        alternativeVenueIds: [ids.eastHall],
      }).expect(200);
      const suggestionId = rejected.body.decisions.at(-1).suggestions[0].id;
      // Suggested when it fitted; its capacity has since been cut (or the
      // suggestion predates the capacity rule).
      await prisma.venue.update({ where: { id: ids.eastHall }, data: { capacity: 50 } });

      const res = await accept(booking.id, suggestionId).expect(409);

      expect(res.body).toMatchObject({
        code: 'CAPACITY_EXCEEDED',
        message: 'eastHall holds 50, but expected attendance is 80.',
      });
      expect(await prisma.venueBooking.count({ where: { venueId: ids.eastHall } })).toBe(0);
      expect(
        (await prisma.bookingSuggestion.findUniqueOrThrow({ where: { id: suggestionId } }))
          .acceptedBookingId,
      ).toBeNull();
    });
  });
});
