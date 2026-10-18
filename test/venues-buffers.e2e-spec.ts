import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BookingStatus,
  EventStatus,
  PrismaClient,
  Role,
  VenueStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { VenueUnavailabilityService } from '../src/bookings/venue-unavailability.service';
import { listenOnLoopback } from './listen-on-loopback';

/**
 * US-50 e2e — availability and conflict checks include each venue's setup and
 * turnaround time. One describe per acceptance criterion, "US-50 AC-n".
 *
 * Buffers are set directly on the venue: configuring them is #54, not built.
 * The customer's example throughout: 30 minutes' setup, 45 minutes'
 * turnaround, so a 10:00–12:00 booking occupies 09:30–12:45 (UTC here).
 */
describe('US-50 buffer-aware availability checks (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const DAY = '2030-10-01';
  const at = (hhmm: string, day = DAY) => `${day}T${hhmm}:00.000Z`;

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

  const seedVenue = async (key: string, setupMinutes = 0, turnaroundMinutes = 0) => {
    const venue = await prisma.venue.create({
      data: {
        name: key,
        location: 'Campus',
        capacity: 200,
        facilities: [],
        accessibilityFeatures: [],
        status: VenueStatus.PUBLISHED,
        managedById: ids.staff,
        setupMinutes,
        turnaroundMinutes,
      },
    });
    ids[key] = venue.id;
  };

  const seedEvent = async (key: string) => {
    const event = await prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        coordinatorId: ids.coordinator,
        name: key,
        purpose: 'p',
        description: 'd',
        category: 'c',
        proposedStart: new Date(at('10:00')),
        proposedEnd: new Date(at('12:00')),
        expectedAttendance: 50,
        status: EventStatus.PLANNING,
      },
    });
    ids[key] = event.id;
  };

  /** An existing booking, written directly: "Existing" event, 10:00–12:00. */
  const existingBooking = async (
    venue: string,
    status: BookingStatus = BookingStatus.APPROVED,
    from = '10:00',
    to = '12:00',
  ) => {
    const booking = await prisma.venueBooking.create({
      data: {
        eventId: ids.existing,
        venueId: ids[venue],
        start: new Date(at(from)),
        end: new Date(at(to)),
        status,
        expectedAttendance: 50,
      },
    });
    ids.existingBooking = booking.id;
    return booking;
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

  const clear = async () => {
    await prisma.notification.deleteMany();
    await prisma.bookingSuggestion.deleteMany();
    await prisma.bookingDecision.deleteMany();
    await prisma.venueBooking.updateMany({ data: { replacesBookingId: null, replacedByBookingId: null } });
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
    await seedUser('staff', 'staff@example.com', Role.VENUE_STAFF);

    // hall: the customer's buffers. plain: none configured.
    await seedVenue('hall', 30, 45);
    await seedVenue('plain');
    await seedEvent('existing');
    await seedEvent('newEvent');
  });

  describe('US-50 AC-2: a request clashing with another booking\'s setup or turnaround is a conflict', () => {
    it("refuses a request that only overlaps the existing booking's turnaround (12:00–12:45)", async () => {
      await existingBooking('hall');

      // Event time 13:00 is clear of 12:00, but its setup (12:30) is not.
      const res = await requestVenue('hall', '13:00', '14:00').expect(409);

      expect(res.body.message).toBe('the requested time overlaps a confirmed booking for this venue');
      expect(res.body.conflicts).toEqual([
        expect.objectContaining({ bookingId: ids.existingBooking, eventName: 'existing' }),
      ]);
    });

    it("refuses a request that only overlaps the existing booking's setup (09:30–10:00)", async () => {
      await existingBooking('hall');

      // Ends 09:15; its own turnaround runs to 10:00, into the setup from 09:30.
      await requestVenue('hall', '08:00', '09:15').expect(409);
    });

    it('accepts a request whose occupied window only touches the existing one', async () => {
      await existingBooking('hall');

      // Existing occupies to 12:45; this one occupies from 12:45 (setup 30).
      await requestVenue('hall', '13:15', '14:00').expect(201);
    });

    it('refuses to approve a pending request that clashes once buffers count', async () => {
      await existingBooking('hall');
      const pending = await prisma.venueBooking.create({
        data: {
          eventId: ids.newEvent,
          venueId: ids.hall,
          start: new Date(at('12:30')),
          end: new Date(at('13:30')),
          status: BookingStatus.REQUESTED,
          expectedAttendance: 50,
        },
      });

      const res = await http()
        .post(`/bookings/${pending.id}/approve`)
        .set('Authorization', as('staff'))
        .send({})
        .expect(409);

      expect(res.body.code).toBe('BOOKING_HARD_CONFLICT');
    });

    it('counts a blocked-out period inside the request\'s own buffers', async () => {
      await prisma.venueBlock.create({
        data: {
          venueId: ids.hall,
          start: new Date(at('12:00')),
          end: new Date(at('12:30')),
          reason: 'Cleaning',
          createdById: ids.staff,
        },
      });

      // 10:00–12:00 is clear of 12:00, but its turnaround to 12:45 is not.
      const res = await requestVenue('hall', '10:00', '12:00').expect(409);
      expect(res.body.message).toBe('the requested time falls in a period blocked out for this venue');
    });

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
    it('allows back-to-back bookings at a venue with no buffers', async () => {
      await existingBooking('plain');

      await requestVenue('plain', '12:00', '13:00').expect(201);
    });

    it('still refuses a real overlap there', async () => {
      await existingBooking('plain');

      await requestVenue('plain', '11:59', '13:00').expect(409);
    });
  });

  describe('US-50 AC-1: availability blocks the setup before and turnaround after each booking', () => {
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
    it.each(['organiser', 'staff'])('is refused to %s, like the US-17 calendar (403)', async (who) => {
      await http()
        .get(`/venues/${ids.hall}/availability/slots`)
        .query({ from: DAY, to: DAY })
        .set('Authorization', as(who))
        .expect(403);
    });
  });

  describe('US-50 AC-5: date search only returns venues free including buffers', () => {
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

    it('returns the venue once the slot clears its turnaround', async () => {
      await existingBooking('hall');

      const res = await http()
        .get('/venues/search')
        .query({ from: at('13:15'), to: at('14:00') }) // setup from 12:45 — touching
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(res.body.map((v: { name: string }) => v.name)).toEqual(['hall', 'plain']);
    });

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
    it('leaves bookings that clash under new buffers exactly as they were', async () => {
      // Two back-to-back approved bookings, fine with no buffers…
      await prisma.venue.update({ where: { id: ids.hall }, data: { setupMinutes: 0, turnaroundMinutes: 0 } });
      const first = await existingBooking('hall', BookingStatus.APPROVED, '10:00', '12:00');
      const second = await prisma.venueBooking.create({
        data: {
          eventId: ids.newEvent,
          venueId: ids.hall,
          start: new Date(at('12:00')),
          end: new Date(at('13:00')),
          status: BookingStatus.APPROVED,
          expectedAttendance: 50,
        },
      });
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
    it('US-41: does not propose, and refuses to suggest, a venue blocked only by buffer time', async () => {
      await existingBooking('hall'); // hall occupied 09:30–12:45
      await seedVenue('other');
      const rejected = await prisma.venueBooking.create({
        data: {
          eventId: ids.newEvent,
          venueId: ids.other,
          start: new Date(at('12:15')),
          end: new Date(at('13:00')),
          status: BookingStatus.REQUESTED,
          expectedAttendance: 50,
        },
      });

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
    const eveningBooking = (venue: string) =>
      prisma.venueBooking.create({
        data: {
          eventId: ids.existing,
          venueId: ids[venue],
          start: new Date(at('19:00')),
          end: new Date(at('23:30')),
          status: BookingStatus.APPROVED,
          expectedAttendance: 50,
        },
      });

    const search = (from: string, to: string) =>
      http()
        .get('/venues/search')
        .query({ from: at(from), to: at(to) })
        .set('Authorization', as('coordinator'))
        .expect(200)
        .then((res) => res.body.map((v: { name: string }) => v.name));

    /** A venue created without the buffer columns: the database default, never configured. */
    const seedUnconfiguredVenue = async (key: string) => {
      const venue = await prisma.venue.create({
        data: {
          name: key,
          location: 'Campus',
          capacity: 60,
          facilities: [],
          accessibilityFeatures: [],
          status: VenueStatus.PUBLISHED,
          managedById: ids.staff,
        },
      });
      ids[key] = venue.id;
      return venue;
    };

    beforeEach(async () => {
      await prisma.venue.update({
        where: { id: ids.hall },
        data: { setupMinutes: 60, turnaroundMinutes: 60 },
      });
    });

    it('AC-1: the 60 min turnaround past midnight marks the next day booked', async () => {
      // Days are Singapore days: 19:00–23:30 SGT = 11:00–15:30Z, turnaround
      // to 00:30 SGT the next day.
      await prisma.venueBooking.create({
        data: {
          eventId: ids.existing,
          venueId: ids.hall,
          start: new Date(at('11:00')),
          end: new Date(at('15:30')),
          status: BookingStatus.APPROVED,
          expectedAttendance: 50,
        },
      });

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

    it('AC-2: refuses 15:00–18:30, whose event time ends inside the booking’s setup (18:00–19:00)', async () => {
      await eveningBooking('hall');

      const res = await requestVenue('hall', '15:00', '18:30').expect(409);

      expect(res.body.conflicts).toHaveLength(1);
    });

    it('edge: refuses 15:00–18:00 — its event time only touches the setup, but its own 60 min turnaround (to 19:00) overlaps it', async () => {
      await eveningBooking('hall');

      await requestVenue('hall', '15:00', '18:00').expect(409);
    });

    it('edge: accepts 15:00–17:00 — occupied 14:00–18:00, touching the booking’s setup at 18:00 is not a clash', async () => {
      await eveningBooking('hall');

      const res = await requestVenue('hall', '15:00', '17:00').expect(201);

      expect(res.body.status).toBe(BookingStatus.REQUESTED);
    });

    it('AC-5: a search for 17:30–18:30 leaves the buffered venue out', async () => {
      await eveningBooking('hall');
      await eveningBooking('plain');

      expect(await search('17:30', '18:30')).toEqual(['plain']);
    });

    it('AC-4: a venue whose buffers were never configured uses the event time alone — 15:00–18:30 accepted, listed in the search', async () => {
      const venue = await seedUnconfiguredVenue('unconfigured');
      // Never configured: the columns hold their database default.
      expect(venue).toMatchObject({ setupMinutes: 0, turnaroundMinutes: 0 });
      await eveningBooking('unconfigured');

      expect(await search('17:30', '18:30')).toContain('unconfigured');
      await requestVenue('unconfigured', '15:00', '18:30').expect(201);
    });

    it('AC-4 (extra): buffers explicitly set to 0 0 behave the same', async () => {
      await prisma.venue.update({
        where: { id: ids.hall },
        data: { setupMinutes: 0, turnaroundMinutes: 0 },
      });
      await eveningBooking('hall');

      expect(await search('17:30', '18:30')).toContain('hall');
      await requestVenue('hall', '15:00', '18:30').expect(201);
    });
  });
});
