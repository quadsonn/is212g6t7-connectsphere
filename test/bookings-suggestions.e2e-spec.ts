import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus, NotificationType, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-41 e2e — Venue Staff suggest alternative venues when a booking request
 * can't be fulfilled. One describe per acceptance criterion, named
 * "US-41 AC-n" for traceability.
 *
 * Code under test: BookingsService reject/reverse with alternativeVenueIds
 * (attachSuggestions, booking-suggestions.ts), GET /bookings/:id/alternatives
 * (BookingSuggestionsService, booking-alternatives.ts ranking), and
 * POST /bookings/:id/suggestions/:suggestionId/accept.
 *
 * Pre-condition for every test: reset the testDB, then run base-users.sql and
 * tc-s3-63-setup.sql (the Showcase's REQUESTED Main Hall booking, BKG-082, and
 * East Hall). Each test loads the tc-s3 script its test case names (see
 * docs/testing/sprint3-test-cases.md). base-venues.sql is not loaded: the
 * alternatives lists must contain only this file's venues.
 */
describe('US-41 suggest an alternative venue (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  /** Fixed rows from base-users, tc-s3-63-setup and tc-s3-63c/64-setup. */
  const ids: Record<string, string> = {
    organiser: 'USR-006',
    coordinator: 'USR-004',
    otherCoordinator: 'USR-005',
    staff: 'USR-010',
    otherStaff: 'USR-018',
    tech: 'USR-009',
    event: 'EVT-196',
    mainHall: 'VEN-041',
    eastHall: 'VEN-042',
    westHall: 'VEN-043',
    stairsHall: 'VEN-047',
    bookedHall: 'VEN-048',
    blockedHall: 'VEN-049',
    draftHall: 'VEN-050',
    seminarRoom: 'VEN-052',
    exactRoom: 'VEN-053',
    alumniLounge: 'VEN-054',
    turnaroundHall: 'VEN-055',
  };
  const LOGINS: Record<string, string> = {
    organiser: 'organiser@example.com',
    coordinator: 'coord.a@example.com',
    otherCoordinator: 'coord.b@example.com',
    staff: 'venue.staff@example.com',
    otherStaff: 'other.staff@example.com',
    tech: 'tech.support@example.com',
  };
  /** The Showcase's Main Hall request Venue Staff are deciding (tc-s3-63-setup). */
  const REQUEST = { id: 'BKG-082' } as const;

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

  /** Loads a test case's setup script(s) on top of the base scripts. */
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
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
    await resetDb(prisma);
    await loadSql(prisma, 'base-users');
    await loadSql(prisma, 'tc-s3-63-setup');
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
    await loadSql(prisma, 'tc-s3-63-setup');
  });

  describe('US-41 AC-1: rejecting can attach one or more alternative venues', () => {
    // TC-S3-63 · US-41 AC-1 · setup: base-users + tc-s3-63-setup + tc-s3-63c-setup · fails if rejecting cannot attach several venues
    // Code: BookingsService decide -> attachSuggestions (booking-suggestions.ts)
    it('records the rejection with the venues attached', async () => {
      await given('tc-s3-63c-setup'); // westHall
      const booking = REQUEST;

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

    // TC-S3-63 · US-41 AC-1 · setup: base-users + tc-s3-63-setup · fails if a rejection without alternatives is refused or invents some
    // Code: BookingsService decide, alternativeVenueIds optional
    it('still rejects without alternatives, as before', async () => {
      const booking = REQUEST;

      const res = await reject(booking.id, { reason: 'No.' }).expect(200);

      expect(res.body.decisions.at(-1).suggestions).toEqual([]);
      expect(await prisma.bookingSuggestion.count()).toBe(0);
    });

    // TC-S3-63 · US-41 AC-1 · setup: base-users + tc-s3-63-setup · fails if a malformed alternatives list is accepted
    // Code: RejectBookingDto: @IsArray, @ArrayUnique, @ArrayMaxSize(10)
    it('refuses the same venue twice, a non-list, and too many', async () => {
      const booking = REQUEST;

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

    // TC-S3-63 · US-41 AC-1 · setup: base-users + tc-s3-63-setup + tc-s3-63b-setup · fails if a reversal to rejected cannot carry alternatives, or an approval can
    // Code: BookingsService reverse -> attachSuggestions
    it('can be attached when a reversal rejects an approved booking, but not to an approval', async () => {
      await given('tc-s3-63b-setup'); // BKG-082 already APPROVED
      const approved = REQUEST;

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

    // TC-S3-63 · US-41 AC-1 · setup: base-users + tc-s3-63-setup · fails if another venue's staff or another role can reject with alternatives
    // Code: BookingsService.findDecidable (venue manager only); @Roles(VENUE_STAFF)
    it.each([
      ['otherStaff', 404],
      ['coordinator', 403],
      ['tech', 403],
    ])('is refused to %s (%i)', async (who, status) => {
      const booking = REQUEST;

      await reject(booking.id, { reason: 'r', alternativeVenueIds: [ids.eastHall] }, who).expect(
        status,
      );
      expect(await prisma.bookingSuggestion.count()).toBe(0);
    });
  });

  describe('US-41 AC-2: the system proposes candidates ranked by how well they match', () => {
    // TC-S3-64 · US-41 AC-2 · setup: base-users + tc-s3-63-setup + tc-s3-64-setup · fails if an unfit or busy venue is proposed, or the ranking is wrong
    // Code: BookingSuggestionsService.alternatives -> rankAlternatives (booking-alternatives.ts)
    it('proposes only free venues that meet capacity and accessibility, best match first', async () => {
      // tc-s3-64-setup: eastHall (100, theatre, step-free) is the closest fit;
      // pendingHall and bigHall also fit; flatHall lacks a theatre layout; the
      // rest are too small, not step-free, booked, blocked or unpublished.
      await given('tc-s3-64-setup');
      const booking = REQUEST;

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

    // TC-S3-64 · US-41 AC-2 · setup: base-users + tc-s3-63-setup + tc-s3-64b-setup · fails if the requested venue is proposed as its own alternative
    // Code: BookingSuggestionsService.alternatives excludes booking.venueId
    it('never proposes the venue the request asked for', async () => {
      await given('tc-s3-64b-setup'); // mainHall itself would fit
      const booking = REQUEST;

      const res = await alternatives(booking.id).expect(200);

      expect(res.body.candidates.map((c: { venueId: string }) => c.venueId)).not.toContain(
        ids.mainHall,
      );
    });

    // TC-S3-64 · US-41 AC-2 · setup: base-users + tc-s3-63-setup + tc-s3-64c-setup · fails if a back-to-back booking makes a venue look busy
    // Code: conflictsFor uses half-open time ranges
    it('allows a booking ending exactly when the slot starts (back-to-back)', async () => {
      const booking = REQUEST;
      await given('tc-s3-64c-setup'); // eastHall booked 07:00 until the slot starts

      const res = await alternatives(booking.id).expect(200);

      expect(res.body.candidates.map((c: { venueId: string }) => c.venueId)).toContain(
        ids.eastHall,
      );
    });

    // TC-S3-64 · US-41 AC-2 · setup: base-users + tc-s3-63-setup · fails if another venue's staff or another role can see the candidates
    // Code: BookingSuggestionsService.alternatives (venue manager only)
    it.each([
      ['otherStaff', 404],
      ['coordinator', 403],
      ['organiser', 403],
    ])('is refused to %s (%i)', async (who, status) => {
      const booking = REQUEST;
      await alternatives(booking.id, who).expect(status);
    });
  });

  describe('US-41 AC-3: Venue Staff pick from the candidates or choose another venue manually', () => {
    // TC-S3-65 · US-41 AC-3 · setup: base-users + tc-s3-63-setup + tc-s3-64-setup · fails if Venue Staff cannot choose a free venue manually
    // Code: attachSuggestions accepts any published, free, big-enough venue
    it('accepts a free venue that was not among the candidates', async () => {
      // Big enough and free, but no step-free access, so not proposed: a
      // manual choice. (Capacity AC-3: a venue too small is not — see below.)
      await given('tc-s3-64-setup'); // stairsHall: free, big enough, not step-free
      const booking = REQUEST;

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

    // TC-S3-65 · US-41 AC-3 · setup: base-users + tc-s3-63-setup + tc-s3-64-setup · fails if an unknown, draft or self venue can be suggested
    // Code: attachSuggestions venue checks
    it('refuses an unknown or unpublished venue, or the requested venue itself', async () => {
      await given('tc-s3-64-setup'); // draftHall is unpublished
      const booking = REQUEST;

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
    // TC-S3-66 · US-41 AC-4 · setup: base-users + tc-s3-63-setup + tc-s3-66-setup or tc-s3-66b-setup · fails if a venue booked or blocked over the slot can be suggested, or a refused rejection still saves something
    // Code: attachSuggestions -> conflictsFor, inside the decision's transaction
    it.each([
      ['an approved booking', 'approved'],
      ['a blocked-out period', 'blocked'],
    ])('refuses a venue held by %s, and records nothing', async (_label, kind) => {
      const booking = REQUEST;
      await given(kind === 'approved' ? 'tc-s3-66-setup' : 'tc-s3-66b-setup');

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

    // TC-S3-66 · US-41 AC-4 · setup: base-users + tc-s3-63-setup + tc-s3-66c-setup · fails if a pending request stops a venue being suggested
    // Code: conflictsFor: only hard conflicts refuse
    it('allows a venue with only a pending request overlapping — it is not booked', async () => {
      const booking = REQUEST;
      await given('tc-s3-66c-setup'); // only a pending request overlaps eastHall

      await reject(booking.id, { reason: 'r', alternativeVenueIds: [ids.eastHall] }).expect(200);
    });
  });

  describe('US-41 AC-5: the Coordinator sees the suggestions on the rejected request, with the reason', () => {
    // TC-S3-67 · US-41 AC-5 · setup: base-users + tc-s3-63-setup · fails if the Coordinator cannot see the reason or the suggestions
    // Code: BookingsService findOne -> BOOKING_INCLUDE decisions.suggestions
    it('shows the reason and the suggested venues on the request', async () => {
      const booking = REQUEST;
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

    // TC-S3-67 · US-41 AC-5 · setup: base-users + tc-s3-63-setup · fails if the rejection notice leaves out the suggestions
    // Code: BookingsService.notifyDecision
    it('names the suggestions in the rejection notification', async () => {
      const booking = REQUEST;
      await reject(booking.id, {
        reason: 'Closed for repairs.',
        alternativeVenueIds: [ids.eastHall],
      }).expect(200);

      const notice = await prisma.notification.findFirstOrThrow({
        where: { recipientId: ids.coordinator, type: NotificationType.VENUE_BOOKING_DECIDED },
      });
      expect(notice.message).toBe(
        'The booking of mainHall for "Showcase" was rejected. Reason: Closed for repairs. Alternative venues suggested: eastHall.',
      );
    });

    // TC-S3-67 · US-41 AC-5 · setup: base-users + tc-s3-63-setup · fails if another Coordinator can read the request and its suggestions
    // Code: AccessControlService scoped booking read (404)
    it('is not shown to another Coordinator', async () => {
      const booking = REQUEST;
      await reject(booking.id, { reason: 'r', alternativeVenueIds: [ids.eastHall] }).expect(200);

      await getBooking(booking.id, 'otherCoordinator').expect(404);
    });
  });

  describe('US-41 AC-6: accepting a suggestion creates a new request, pre-filled with the original details', () => {
    const rejectWithEastHall = async () => {
      const booking = REQUEST;
      const res = await reject(booking.id, {
        reason: 'Closed.',
        alternativeVenueIds: [ids.eastHall],
      }).expect(200);
      return { booking, suggestionId: res.body.decisions.at(-1).suggestions[0].id as string };
    };

    // TC-S3-68 · US-41 AC-6 · setup: base-users + tc-s3-63-setup · fails if accepting does not create a request, or loses the original details
    // Code: BookingSuggestionsService.accept -> BookingsService.request
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

    // TC-S3-68 · US-41 AC-6 · setup: base-users + tc-s3-63-setup · fails if a suggestion can be accepted twice
    // Code: BookingSuggestionsService.accept checks acceptedBookingId
    it('cannot accept the same suggestion twice', async () => {
      const { booking, suggestionId } = await rejectWithEastHall();
      await accept(booking.id, suggestionId).expect(201);

      const again = await accept(booking.id, suggestionId).expect(409);

      expect(again.body.message).toBe('this suggestion has already been accepted');
      expect(await prisma.venueBooking.count({ where: { venueId: ids.eastHall } })).toBe(1);
    });

    // TC-S3-68 · US-41 AC-6 · setup: base-users + tc-s3-63-setup + tc-s3-66-setup (after the rejection) · fails if accepting skips the overlap check
    // Code: BookingsService.request overlap check
    it('goes through the normal request checks: refused if the venue was booked meanwhile', async () => {
      const { booking, suggestionId } = await rejectWithEastHall();
      await given('tc-s3-66-setup'); // eastHall is booked meanwhile

      const res = await accept(booking.id, suggestionId).expect(409);

      expect(res.body.message).toBe('the requested time overlaps a confirmed booking for this venue');
      expect(
        (await prisma.bookingSuggestion.findUniqueOrThrow({ where: { id: suggestionId } }))
          .acceptedBookingId,
      ).toBeNull();
    });

    // TC-S3-68 · US-41 AC-6 · setup: base-users + tc-s3-63-setup · fails if a suggestion can be accepted on a request that is no longer rejected
    // Code: BookingSuggestionsService.accept requires REJECTED
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

    // TC-S3-68 · US-41 AC-6 · setup: base-users + tc-s3-63-setup · fails if a suggestion can be accepted through another request or by another Coordinator
    // Code: BookingSuggestionsService.accept scoping
    it('404s for a suggestion of another request, or another Coordinator', async () => {
      const { booking, suggestionId } = await rejectWithEastHall();

      await accept('another-booking', suggestionId).expect(404);
      await accept(booking.id, suggestionId, 'otherCoordinator').expect(404);
    });

    // TC-S3-68 · US-41 AC-6 · setup: base-users + tc-s3-63-setup · fails if a role other than the Coordinator can accept
    // Code: @Roles(EVENT_COORDINATOR) on accept
    it.each(['staff', 'organiser', 'tech'])('is refused to %s (403)', async (who) => {
      const { booking, suggestionId } = await rejectWithEastHall();
      await accept(booking.id, suggestionId, who).expect(403);
    });
  });

  describe("US-41 AC-7: suggestions are recorded in the request's history", () => {
    // TC-S3-69 · US-41 AC-7 · setup: base-users + tc-s3-63-setup + tc-s3-63c-setup · fails if suggestions are lost from, or attached to the wrong entry of, the history
    // Code: BookingDecision.suggestions, decisions ordered by createdAt
    it('keeps each decision with its own suggestions, oldest first', async () => {
      await given('tc-s3-63c-setup'); // westHall
      const booking = REQUEST;
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

    // TC-S3-64 · US-41 AC-2 (capacity) · setup: base-users + tc-s3-63-setup + tc-s3-64-setup · fails if a venue too small is offered
    // Code: booking-alternatives.ts capacity filter (venues/capacity.ts)
    it('Capacity AC-3: the list excludes venues too small for the expected attendance', async () => {
      // The request is for 80 people.
      await given('tc-s3-64-setup'); // seminarRoom holds 40, exactRoom 80
      const booking = REQUEST;

      const res = await alternatives(booking.id).expect(200);
      const offered = [...ids_of(res.body.candidates), ...ids_of(res.body.others)];

      expect(offered).not.toContain(ids.seminarRoom);
      // Equal attendance and capacity fits.
      expect(offered).toContain(ids.exactRoom);
    });

    // TC-S3-64, TC-S3-66 · US-41 AC-2/AC-4 · setup: base-users + tc-s3-63-setup + tc-s3-64-setup · fails if a booked, blocked or turning-around venue is offered or accepted
    // Code: conflictsFor with venue buffers
    it('Capacity AC-3: the list excludes venues that are not free, including within setup or turnaround time', async () => {
      // Big enough, but booked over the slot, blocked out, or (US-50) still
      // turning around after a booking that ends 30 minutes before it.
      await given('tc-s3-64-setup');
      const booking = REQUEST;

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

    // TC-S3-66 · US-41 AC-4 (capacity) · setup: base-users + tc-s3-63-setup + tc-s3-64-setup · fails if an under-capacity venue can be suggested through the API
    // Code: attachSuggestions -> capacityShortfall
    it('Capacity AC-3: the server refuses an under-capacity venue even when the page is bypassed, and records nothing', async () => {
      await given('tc-s3-64-setup'); // alumniLounge holds 40
      const booking = REQUEST;

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

    // TC-S3-66 · US-41 AC-4 (capacity) · setup: base-users + tc-s3-63-setup + tc-s3-64-setup + tc-s3-63b-setup · fails if a reversal can suggest an under-capacity venue
    // Code: attachSuggestions -> capacityShortfall
    it('Capacity AC-3: the same check applies when a reversal (US-52) suggests venues', async () => {
      await given('tc-s3-64-setup', 'tc-s3-63b-setup'); // alumniLounge holds 40; BKG-082 APPROVED
      const booking = REQUEST;

      const res = await http()
        .post(`/bookings/${booking.id}/reverse`)
        .set('Authorization', as('staff'))
        .send({ reason: 'Flooded.', alternativeVenueIds: [ids.alumniLounge] })
        .expect(409);

      expect(res.body.code).toBe('CAPACITY_EXCEEDED');
    });

    // TC-S3-64 · US-41 AC-2 (capacity) · setup: base-users + tc-s3-63-setup + tc-s3-64d-setup · fails if an unfit venue is offered when none fits
    // Code: booking-alternatives.ts capacity filter
    it('Capacity AC-4: nothing is offered when no free venue is big enough', async () => {
      await given('tc-s3-64d-setup'); // eastHall cut to 40; seminarRoom holds 60
      const booking = REQUEST;

      const res = await alternatives(booking.id).expect(200);

      expect(res.body).toMatchObject({ expectedAttendance: 80, candidates: [], others: [] });
    });
  });

  describe('Capacity AC-1/AC-2: the Coordinator cannot request a suggested venue that is too small', () => {
    // TC-S3-68 · US-41 AC-6 (capacity) · setup: base-users + tc-s3-63-setup + tc-s3-68b-setup (after the rejection) · fails if a suggestion can be accepted for a venue that is now too small
    // Code: BookingsService.request -> capacityShortfall
    it('Capacity AC-1/AC-2: refuses accepting a suggestion whose venue no longer holds the attendance', async () => {
      const booking = REQUEST;
      const rejected = await reject(booking.id, {
        reason: 'Closed.',
        alternativeVenueIds: [ids.eastHall],
      }).expect(200);
      const suggestionId = rejected.body.decisions.at(-1).suggestions[0].id;
      // Suggested when it fitted; its capacity has since been cut (or the
      // suggestion predates the capacity rule).
      await given('tc-s3-68b-setup'); // eastHall cut to 50

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
