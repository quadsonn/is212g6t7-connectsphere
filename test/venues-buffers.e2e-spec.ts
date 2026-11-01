import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { VenueUnavailabilityService } from '../src/bookings/venue-unavailability.service';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-50 e2e — availability and conflict checks include each venue's setup and
 * turnaround time. One describe per acceptance criterion, "US-50 AC-n".
 *
 * Buffers are set directly on the venue: configuring them is #54, not built.
 * The customer's example throughout: 30 minutes' setup, 45 minutes'
 * turnaround, so a 10:00–12:00 booking occupies 09:30–12:45 (UTC here).
 *
 * Pre-condition for every test: reset the testDB, then run base-users.sql and
 * tc-s3-130-setup.sql (hall VEN-068 with 30/45 buffers, plain VEN-069 with
 * none, events "existing" and "newEvent"). Bookings and blocks come from the
 * tc-s3-13x scripts each test names. A few tests then change data mid-scenario
 * (buffers configured later, a request moved): that change is what they test.
 */
describe('US-50 buffer-aware availability checks (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  /** Fixed rows from base-users and the tc-s3-130 scripts. */
  const ids: Record<string, string> = {
    organiser: 'USR-006',
    coordinator: 'USR-004',
    staff: 'USR-010',
    hall: 'VEN-068',
    plain: 'VEN-069',
    other: 'VEN-070',
    unconfigured: 'VEN-071',
    existing: 'EVT-253',
    newEvent: 'EVT-254',
  };
  const LOGINS: Record<string, string> = {
    organiser: 'organiser@example.com',
    coordinator: 'coord.a@example.com',
    staff: 'venue.staff@example.com',
  };

  const DAY = '2030-10-01';
  const at = (hhmm: string, day = DAY) => `${day}T${hhmm}:00.000Z`;

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  /** Loads a test case's setup script(s) on top of the base scripts. */
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  /** An existing booking for the "existing" event, from its setup script. */
  const EXISTING: Record<string, [script: string, id: string]> = {
    'hall APPROVED 10:00-12:00': ['tc-s3-131-setup', 'BKG-120'],
    'plain APPROVED 10:00-12:00': ['tc-s3-133-setup', 'BKG-121'],
    'hall REQUESTED 10:00-12:00': ['tc-s3-130b-setup', 'BKG-122'],
    'hall APPROVED 15:00-15:45': ['tc-s3-130c-setup', 'BKG-123'],
    'plain APPROVED 15:00-15:45': ['tc-s3-130d-setup', 'BKG-124'],
  };
  const existingBooking = async (
    venue: string,
    status: BookingStatus = BookingStatus.APPROVED,
    from = '10:00',
    to = '12:00',
  ) => {
    const [script, id] = EXISTING[`${venue} ${status} ${from}-${to}`];
    await given(script);
    ids.existingBooking = id;
    return { id };
  };

  const requestVenue = (venue: string, from: string, to: string, day = DAY) =>
    http()
      .post('/bookings')
      .set('Authorization', as('coordinator'))
      .send({
        eventId: ids.newEvent,
        venueId: ids[venue],
        start: at(from, day),
        end: at(to, day),
        expectedAttendance: 50,
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
    await loadSql(prisma, 'tc-s3-130-setup');
  });

  describe('US-50 AC-2: a request clashing with another booking\'s setup or turnaround is a conflict', () => {
    // TC-S3-131 · US-50 AC-2 · setup: base-users + tc-s3-130-setup + tc-s3-131-setup · fails if a request overlapping another booking's setup or turnaround window (or a block within its own buffers) is not a conflict
    // Code: BookingsService.conflictsFor / approve with paddedRange
    it("refuses a request that only overlaps the existing booking's turnaround (12:00–12:45)", async () => {
      await existingBooking('hall');

      // Event time 13:00 is clear of 12:00, but its setup (12:30) is not.
      const res = await requestVenue('hall', '13:00', '14:00').expect(409);

      expect(res.body.message).toBe('the requested time overlaps a confirmed booking for this venue');
      expect(res.body.conflicts).toEqual([
        expect.objectContaining({ bookingId: ids.existingBooking, eventName: 'existing' }),
      ]);
    });

    // TC-S3-131 · US-50 AC-2 · setup: base-users + tc-s3-130-setup + tc-s3-131-setup · fails if a request overlapping another booking's setup or turnaround window (or a block within its own buffers) is not a conflict
    // Code: BookingsService.conflictsFor / approve with paddedRange
    it("refuses a request that only overlaps the existing booking's setup (09:30–10:00)", async () => {
      await existingBooking('hall');

      // Ends 09:15; its own turnaround runs to 10:00, into the setup from 09:30.
      await requestVenue('hall', '08:00', '09:15').expect(409);
    });

    // TC-S3-131 · US-50 AC-2 · setup: base-users + tc-s3-130-setup + tc-s3-131-setup · fails if a request overlapping another booking's setup or turnaround window (or a block within its own buffers) is not a conflict
    // Code: BookingsService.conflictsFor / approve with paddedRange
    it('accepts a request whose occupied window only touches the existing one', async () => {
      await existingBooking('hall');

      // Existing occupies to 12:45; this one occupies from 12:45 (setup 30).
      await requestVenue('hall', '13:15', '14:00').expect(201);
    });

    // TC-S3-131 · US-50 AC-2 · setup: base-users + tc-s3-130-setup + tc-s3-131b-setup + tc-s3-131-setup · fails if a request overlapping another booking's setup or turnaround window (or a block within its own buffers) is not a conflict
    // Code: BookingsService.conflictsFor / approve with paddedRange
    it('refuses to approve a pending request that clashes once buffers count', async () => {
      await existingBooking('hall');
      await given('tc-s3-131b-setup'); // newEvent requested hall 12:30-13:30
      const pending = { id: 'BKG-125' };

      const res = await http()
        .post(`/bookings/${pending.id}/approve`)
        .set('Authorization', as('staff'))
        .send({})
        .expect(409);

      expect(res.body.code).toBe('BOOKING_HARD_CONFLICT');
    });

    // TC-S3-131 · US-50 AC-2 · setup: base-users + tc-s3-130-setup + tc-s3-131c-setup · fails if a request overlapping another booking's setup or turnaround window (or a block within its own buffers) is not a conflict
    // Code: BookingsService.conflictsFor / approve with paddedRange
    it('counts a blocked-out period inside the request\'s own buffers', async () => {
      await given('tc-s3-131c-setup'); // hall blocked 12:00-12:30, "Cleaning"

      // 10:00–12:00 is clear of 12:00, but its turnaround to 12:45 is not.
      const res = await requestVenue('hall', '10:00', '12:00').expect(409);
      expect(res.body.message).toBe('the requested time falls in a period blocked out for this venue');
    });

    // TC-S3-131 · US-50 AC-2 · setup: base-users + tc-s3-130-setup + tc-s3-131-setup · fails if a request overlapping another booking's setup or turnaround window (or a block within its own buffers) is not a conflict
    // Code: BookingsService.conflictsFor / approve with paddedRange
    it('reports the buffer clash to Venue Staff as a hard conflict', async () => {
      await existingBooking('hall');
      const pending = await requestVenue('hall', '13:15', '14:00').expect(201);
      // Move it into the turnaround, as an existing request would sit there.
      await prisma.venueBooking.update({
        where: { id: pending.body.id },
        data: { start: new Date(at('12:40')) },
      });

      const res = await http()
        .get(`/bookings/${pending.body.id}/conflicts`)
        .set('Authorization', as('staff'))
        .expect(200);

      expect(res.body.hasHardConflict).toBe(true);
      expect(res.body.hardConflicts).toEqual([
        expect.objectContaining({ bookingId: ids.existingBooking }),
      ]);
    });
  });

  describe('US-50 AC-4: venues without configured buffers fall back to zero', () => {
    // TC-S3-133 · US-50 AC-4 · setup: base-users + tc-s3-130-setup + tc-s3-133-setup · fails if a venue without buffers is padded, or a real overlap there is allowed
    // Code: venue setup/turnaround default 0
    it('allows back-to-back bookings at a venue with no buffers', async () => {
      await existingBooking('plain');

      await requestVenue('plain', '12:00', '13:00').expect(201);
    });

    // TC-S3-133 · US-50 AC-4 · setup: base-users + tc-s3-130-setup + tc-s3-133-setup · fails if a venue without buffers is padded, or a real overlap there is allowed
    // Code: venue setup/turnaround default 0
    it('still refuses a real overlap there', async () => {
      await existingBooking('plain');

      await requestVenue('plain', '11:59', '13:00').expect(409);
    });
  });

  describe('US-50 AC-1: availability blocks the setup before and turnaround after each booking', () => {
    // TC-S3-130 · US-50 AC-1 · setup: base-users + tc-s3-130-setup + tc-s3-130c-setup · fails if availability does not block the setup before and turnaround after a booking
    // Code: venue availability calendar pads bookings
    it("marks the next day booked when a booking's turnaround runs past midnight", async () => {
      // 23:00–23:45 Singapore time = 15:00–15:45Z; turnaround to 00:30 SGT.
      await existingBooking('hall', BookingStatus.APPROVED, '15:00', '15:45');

      const res = await http()
        .get(`/venues/${ids.hall}/availability`)
        .query({ from: '2030-10-01', to: '2030-10-02' })
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(res.body).toEqual([
        { date: '2030-10-01', status: 'booked' },
        { date: '2030-10-02', status: 'booked' },
      ]);
    });

    // TC-S3-130 · US-50 AC-1 · setup: base-users + tc-s3-130-setup + tc-s3-130d-setup · fails if availability does not block the setup before and turnaround after a booking
    // Code: venue availability calendar pads bookings
    it('the same booking at a venue without buffers leaves the next day free', async () => {
      await existingBooking('plain', BookingStatus.APPROVED, '15:00', '15:45');

      const res = await http()
        .get(`/venues/${ids.plain}/availability`)
        .query({ from: '2030-10-01', to: '2030-10-02' })
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(res.body.map((d: { status: string }) => d.status)).toEqual(['booked', 'free']);
    });
  });

  describe('US-50 AC-3: setup and turnaround are shown separately from the event time', () => {
    // TC-S3-132 · US-50 AC-3 · setup: base-users + tc-s3-130-setup + tc-s3-131-setup · fails if setup and turnaround are not shown separately from the event time, or a pending request reveals the event
    // Code: GET /venues/:id/availability/slots segments
    it('returns each booking as separate setup, event and turnaround segments', async () => {
      await existingBooking('hall');

      const res = await http()
        .get(`/venues/${ids.hall}/availability/slots`)
        .query({ from: DAY, to: DAY })
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(res.body).toEqual([
        {
          status: 'booked',
          segments: [
            { kind: 'SETUP', start: at('09:30'), end: at('10:00') },
            { kind: 'EVENT', start: at('10:00'), end: at('12:00') },
            { kind: 'TURNAROUND', start: at('12:00'), end: at('12:45') },
          ],
        },
      ]);
    });

    // TC-S3-132 · US-50 AC-3 · setup: base-users + tc-s3-130-setup + tc-s3-130b-setup · fails if setup and turnaround are not shown separately from the event time, or a pending request reveals the event
    // Code: GET /venues/:id/availability/slots segments
    it('shows a pending request as tentative, and nothing identifying the event', async () => {
      await existingBooking('hall', BookingStatus.REQUESTED);

      const res = await http()
        .get(`/venues/${ids.hall}/availability/slots`)
        .query({ from: DAY, to: DAY })
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(res.body[0].status).toBe('tentative');
      expect(JSON.stringify(res.body)).not.toContain('existing');
      expect(Object.keys(res.body[0]).sort()).toEqual(['segments', 'status']);
    });

    // TC-S3-132 · US-50 AC-3 · setup: base-users + tc-s3-130-setup + tc-s3-130c-setup · fails if setup and turnaround are not shown separately from the event time, or a pending request reveals the event
    // Code: GET /venues/:id/availability/slots segments
    it('includes a booking whose turnaround alone reaches into the range', async () => {
      await existingBooking('hall', BookingStatus.APPROVED, '15:00', '15:45');

      const res = await http()
        .get(`/venues/${ids.hall}/availability/slots`)
        .query({ from: '2030-10-02', to: '2030-10-02' })
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].segments.at(-1)).toEqual({
        kind: 'TURNAROUND',
        start: at('15:45'),
        end: at('16:30'),
      });
    });

    // Venue Staff hold no CHECK_AVAILABILITY grant: they use /calendar.
    // TC-S3-132 · US-50 AC-3 · setup: base-users + tc-s3-130-setup · fails if setup and turnaround are not shown separately from the event time, or a pending request reveals the event
    // Code: GET /venues/:id/availability/slots segments
    it.each(['organiser', 'staff'])('is refused to %s, like the US-17 calendar (403)', async (who) => {
      await http()
        .get(`/venues/${ids.hall}/availability/slots`)
        .query({ from: DAY, to: DAY })
        .set('Authorization', as(who))
        .expect(403);
    });
  });

  describe('US-50 AC-5: date search only returns venues free including buffers', () => {
    // TC-S3-134 · US-50 AC-5 · setup: base-users + tc-s3-130-setup + tc-s3-131-setup + tc-s3-133-setup · fails if date search lists a venue busy only within its buffers, or counts pending requests
    // Code: VenuesService.search with padded ranges
    it('leaves out a venue blocked only by buffer time', async () => {
      await existingBooking('hall'); // occupies 09:30–12:45
      await existingBooking('plain'); // occupies 10:00–12:00

      const res = await http()
        .get('/venues/search')
        .query({ from: at('12:15'), to: at('13:00') })
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(res.body.map((v: { name: string }) => v.name)).toEqual(['plain']);
    });

    // TC-S3-134 · US-50 AC-5 · setup: base-users + tc-s3-130-setup + tc-s3-131-setup · fails if date search lists a venue busy only within its buffers, or counts pending requests
    // Code: VenuesService.search with padded ranges
    it('returns the venue once the slot clears its turnaround', async () => {
      await existingBooking('hall');

      const res = await http()
        .get('/venues/search')
        .query({ from: at('13:15'), to: at('14:00') }) // setup from 12:45 — touching
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(res.body.map((v: { name: string }) => v.name)).toEqual(['hall', 'plain']);
    });

    // TC-S3-134 · US-50 AC-5 · setup: base-users + tc-s3-130-setup + tc-s3-130b-setup · fails if date search lists a venue busy only within its buffers, or counts pending requests
    // Code: VenuesService.search with padded ranges
    it('still ignores pending requests, as before', async () => {
      await existingBooking('hall', BookingStatus.REQUESTED);

      const res = await http()
        .get('/venues/search')
        .query({ from: at('12:15'), to: at('13:00') })
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(res.body.map((v: { name: string }) => v.name)).toEqual(['hall', 'plain']);
    });
  });

  describe('US-50: existing bookings are not changed or deleted', () => {
    // TC-S3-131 · US-50 AC-2 · setup: base-users + tc-s3-130-setup + tc-s3-130e-setup · fails if re-checking with new buffers changes or deletes existing bookings
    // Code: conflict checks are read-only
    it('leaves bookings that clash under new buffers exactly as they were', async () => {
      // Two back-to-back approved bookings, fine with no buffers… (tc-s3-130e-setup)
      await given('tc-s3-130e-setup');
      const first = { id: 'BKG-127' };
      const second = { id: 'BKG-128' };
      const before = await prisma.venueBooking.findMany({ orderBy: { start: 'asc' } });

      // …then buffers are configured (#54), and the checks run again.
      await prisma.venue.update({ where: { id: ids.hall }, data: { setupMinutes: 30, turnaroundMinutes: 45 } });
      await http()
        .get(`/bookings/${second.id}/conflicts`)
        .set('Authorization', as('staff'))
        .expect(200)
        .expect((res) => expect(res.body.hasHardConflict).toBe(true));
      await http()
        .get(`/venues/${ids.hall}/availability`)
        .query({ from: DAY, to: DAY })
        .set('Authorization', as('coordinator'))
        .expect(200);

      // Identifying them is #56; US-50 changes and deletes nothing.
      expect(await prisma.venueBooking.findMany({ orderBy: { start: 'asc' } })).toEqual(before);
      expect(before.map((b) => b.id)).toEqual([first.id, second.id]);
    });
  });

  describe('US-50: US-41 and US-52 use the same buffer-aware check', () => {
    // TC-S3-131 · US-50 AC-2 · setup: base-users + tc-s3-130-setup + tc-s3-130f-setup + tc-s3-131-setup · fails if alternative suggestions or venue unavailability ignore buffers
    // Code: booking-alternatives / VenueUnavailabilityService use the same padded check
    it('US-41: does not propose, and refuses to suggest, a venue blocked only by buffer time', async () => {
      await existingBooking('hall'); // hall occupied 09:30–12:45
      await given('tc-s3-130f-setup'); // venue "other", where newEvent requested 12:15-13:00
      const rejected = { id: 'BKG-129' };

      const alternatives = await http()
        .get(`/bookings/${rejected.id}/alternatives`)
        .set('Authorization', as('staff'))
        .expect(200);
      expect(alternatives.body.candidates.map((c: { name: string }) => c.name)).toEqual(['plain']);

      const res = await http()
        .post(`/bookings/${rejected.id}/reject`)
        .set('Authorization', as('staff'))
        .send({ reason: 'Other is closed.', alternativeVenueIds: [ids.hall] })
        .expect(409);
      expect(res.body.message).toBe('hall is not free for the requested time, so it cannot be suggested');
    });

    // TC-S3-131 · US-50 AC-2 · setup: base-users + tc-s3-130-setup + tc-s3-131-setup · fails if alternative suggestions or venue unavailability ignore buffers
    // Code: booking-alternatives / VenueUnavailabilityService use the same padded check
    it("US-52: a venue unavailable during only a booking's turnaround affects that booking", async () => {
      await existingBooking('hall'); // turnaround 12:00–12:45

      const affected = await app
        .get(VenueUnavailabilityService)
        .handleVenueUnavailable(
          ids.hall,
          { start: new Date(at('12:30')), end: new Date(at('14:00')) },
          'Burst pipe',
        );

      expect(affected.map((a) => a.bookingId)).toEqual([ids.existingBooking]);
    });

    // TC-S3-131 · US-50 AC-2 · setup: base-users + tc-s3-130-setup + tc-s3-133-setup · fails if alternative suggestions or venue unavailability ignore buffers
    // Code: booking-alternatives / VenueUnavailabilityService use the same padded check
    it('US-52: the same period does not affect a booking at a venue without buffers', async () => {
      await existingBooking('plain');

      const affected = await app
        .get(VenueUnavailabilityService)
        .handleVenueUnavailable(
          ids.plain,
          { start: new Date(at('12:30')), end: new Date(at('14:00')) },
          'Burst pipe',
        );

      expect(affected).toEqual([]);
    });
  });
  /**
   * The click-through guide's US-50 scenario, case for case: an approved
   * booking 19:00–23:30 at a venue with 60 min setup and 60 min turnaround,
   * so it occupies 18:00 → 00:30 the next day. Buffers apply to the new
   * request too: a request occupies [start − 60 min, end + 60 min). Touching
   * is not a clash. Every time is on the half-hour, as the form offers.
   */
  describe('US-50 click-through scenario: evening booking, 60 min setup, 60 min turnaround', () => {
    /** The evening booking (19:00-23:30) for "existing", from its setup script. */
    const EVENING: Record<string, string | null> = {
      hall: 'tc-s3-130h-setup',
      plain: 'tc-s3-130i-setup',
      unconfigured: null, // tc-s3-130j-setup brings the venue and its booking
    };
    const eveningBooking = async (venue: string) => {
      const script = EVENING[venue];
      if (script) await given(script);
    };

    const search = (from: string, to: string) =>
      http()
        .get('/venues/search')
        .query({ from: at(from), to: at(to) })
        .set('Authorization', as('coordinator'))
        .expect(200)
        .then((res) => res.body.map((v: { name: string }) => v.name));

    /** A venue created without the buffer columns: the database default, never configured. */
    const seedUnconfiguredVenue = async (key: string) => {
      await given('tc-s3-130j-setup');
      return prisma.venue.findUniqueOrThrow({ where: { id: ids[key] } });
    };

    beforeEach(async () => {
      await given('tc-s3-130g-setup'); // hall: 60 min setup, 60 min turnaround
    });

    // TC-S3-130 · US-50 AC-1 · setup: base-users + tc-s3-130-setup + tc-s3-130k-setup + tc-s3-130g-setup · fails if a turnaround running past midnight leaves the next day free
    // Code: venue availability calendar pads bookings with the venue's buffers
    it('AC-1: the 60 min turnaround past midnight marks the next day booked', async () => {
      // Days are Singapore days: 19:00–23:30 SGT = 11:00–15:30Z, turnaround
      // to 00:30 SGT the next day.
      await given('tc-s3-130k-setup'); // hall 11:00-15:30

      const res = await http()
        .get(`/venues/${ids.hall}/availability`)
        .query({ from: '2030-10-01', to: '2030-10-02' })
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(res.body).toEqual([
        { date: '2030-10-01', status: 'booked' },
        { date: '2030-10-02', status: 'booked' },
      ]);
    });

    // TC-S3-131 · US-50 AC-2 · setup: base-users + tc-s3-130-setup + tc-s3-130g-setup + tc-s3-130h-setup · fails if a request ending inside another booking's setup is accepted
    // Code: BookingsService.conflictsFor with paddedRange
    it('AC-2: refuses 15:00–18:30, whose event time ends inside the booking’s setup (18:00–19:00)', async () => {
      await eveningBooking('hall');

      const res = await requestVenue('hall', '15:00', '18:30').expect(409);

      expect(res.body.conflicts).toHaveLength(1);
    });

    // TC-S3-131 · US-50 AC-2 · setup: base-users + tc-s3-130-setup + tc-s3-130g-setup + tc-s3-130h-setup · fails if the request's own buffers are ignored, or touching windows are treated as a clash
    // Code: BookingsService.conflictsFor (half-open, both sides padded)
    it('edge: refuses 15:00–18:00 — its event time only touches the setup, but its own 60 min turnaround (to 19:00) overlaps it', async () => {
      await eveningBooking('hall');

      await requestVenue('hall', '15:00', '18:00').expect(409);
    });

    // TC-S3-131 · US-50 AC-2 · setup: base-users + tc-s3-130-setup + tc-s3-130g-setup + tc-s3-130h-setup · fails if the request's own buffers are ignored, or touching windows are treated as a clash
    // Code: BookingsService.conflictsFor (half-open, both sides padded)
    it('edge: accepts 15:00–17:00 — occupied 14:00–18:00, touching the booking’s setup at 18:00 is not a clash', async () => {
      await eveningBooking('hall');

      const res = await requestVenue('hall', '15:00', '17:00').expect(201);

      expect(res.body.status).toBe(BookingStatus.REQUESTED);
    });

    // TC-S3-134 · US-50 AC-5 · setup: base-users + tc-s3-130-setup + tc-s3-130g-setup + tc-s3-130h-setup + tc-s3-130i-setup · fails if date search lists a venue that is busy only within its buffers
    // Code: VenuesService.search with padded ranges
    it('AC-5: a search for 17:30–18:30 leaves the buffered venue out', async () => {
      await eveningBooking('hall');
      await eveningBooking('plain');

      expect(await search('17:30', '18:30')).toEqual(['plain']);
    });

    // TC-S3-133 · US-50 AC-4 · setup: base-users + tc-s3-130-setup + tc-s3-130g-setup + tc-s3-130j-setup · fails if a venue without configured buffers is padded anyway
    // Code: venue setup/turnaround default 0
    it('AC-4: a venue whose buffers were never configured uses the event time alone — 15:00–18:30 accepted, listed in the search', async () => {
      const venue = await seedUnconfiguredVenue('unconfigured');
      // Never configured: the columns hold their database default.
      expect(venue).toMatchObject({ setupMinutes: 0, turnaroundMinutes: 0 });
      await eveningBooking('unconfigured');

      expect(await search('17:30', '18:30')).toContain('unconfigured');
      await requestVenue('unconfigured', '15:00', '18:30').expect(201);
    });

    // TC-S3-133 · US-50 AC-4 · setup: base-users + tc-s3-130-setup + tc-s3-130l-setup + tc-s3-130g-setup + tc-s3-130h-setup · fails if a venue without configured buffers is padded anyway
    // Code: venue setup/turnaround default 0
    it('AC-4 (extra): buffers explicitly set to 0 0 behave the same', async () => {
      await given('tc-s3-130l-setup'); // hall's buffers set back to 0 and 0
      await eveningBooking('hall');

      expect(await search('17:30', '18:30')).toContain('hall');
      await requestVenue('hall', '15:00', '18:30').expect(201);
    });
  });
});
