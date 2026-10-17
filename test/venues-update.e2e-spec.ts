import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BookingStatus,
  EventStatus,
  NotificationType,
  PrismaClient,
  Role,
  VenueStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';

/** US-14 e2e — updating an existing venue. */
describe('US-14 update an existing venue (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

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

  const seedVenue = async (overrides: Record<string, unknown> = {}) =>
    prisma.venue.create({
      data: {
        name: 'Sandbox Auditorium',
        location: 'School of Computing, Level 1',
        capacity: 420,
        facilities: ['STAGE'],
        accessibilityFeatures: ['STEP_FREE_ACCESS', 'HEARING_LOOP'],
        supportedLayouts: ['THEATRE', 'CLASSROOM'],
        operatingInfo: 'Mon-Fri, 08:00-22:00',
        status: VenueStatus.PUBLISHED,
        managedById: ids.staffA,
        ...overrides,
      },
    });

  /** A live booking on the venue, so AC-3 has something to warn about. */
  const seedBooking = async (venueId: string) => {
    const event = await prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        name: 'Orientation',
        purpose: 'Welcome',
        description: 'Programme',
        category: 'Student engagement',
        proposedStart: new Date('2030-10-01T09:00:00Z'),
        proposedEnd: new Date('2030-10-01T17:00:00Z'),
        expectedAttendance: 400,
        status: EventStatus.APPROVED,
      },
    });

    return prisma.venueBooking.create({
      data: {
        eventId: event.id,
        venueId,
        start: new Date('2030-10-01T08:00:00Z'),
        end: new Date('2030-10-01T18:00:00Z'),
        status: BookingStatus.APPROVED,
      },
    });
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.venueBooking.deleteMany();
    await prisma.venue.deleteMany();
    await prisma.clarificationMessage.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();

    await seedUser('staffA', 'staff.a@example.com', Role.VENUE_STAFF);
    await seedUser('staffB', 'staff.b@example.com', Role.VENUE_STAFF);
    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);
  });

  const patch = (id: string, body: Record<string, unknown>, who = 'staffA') =>
    http().patch(`/venues/${id}`).set('Authorization', as(who)).send(body);

  describe('AC-1: any detail can be edited', () => {
    it('edits capacity, facilities, accessibility, layouts and hours', async () => {
      const venue = await seedVenue();

      const res = await patch(venue.id, {
        capacity: 500,
        facilities: ['STAGE', 'SOUND_SYSTEM'],
        accessibilityFeatures: ['STEP_FREE_ACCESS', 'HEARING_LOOP', 'ACCESSIBLE_RESTROOMS'],
        supportedLayouts: ['THEATRE', 'CLASSROOM', 'BANQUET'],
        operatingInfo: 'Mon-Sun, 07:00-23:00',
      }).expect(200);

      expect(res.body).toMatchObject({
        capacity: 500,
        facilities: ['STAGE', 'SOUND_SYSTEM'],
        supportedLayouts: ['THEATRE', 'CLASSROOM', 'BANQUET'],
        operatingInfo: 'Mon-Sun, 07:00-23:00',
      });
    });

    it('rejects a layout outside the shared vocabulary', async () => {
      const venue = await seedVenue();

      await patch(venue.id, { supportedLayouts: ['CABARET'] }).expect(400);
    });

    it.each(['coordinator', 'organiser'])('refuses %s at the role gate', async (who) => {
      const venue = await seedVenue();

      await patch(venue.id, { capacity: 1 }, who).expect(403);
    });

    it('refuses another manager’s venue', async () => {
      const venue = await seedVenue();

      await patch(venue.id, { capacity: 1 }, 'staffB').expect(404);
    });
  });

  describe('AC-2: the change persists and the catalogue reflects it', () => {
    it('is visible to a Coordinator on next load', async () => {
      const venue = await seedVenue();

      await patch(venue.id, { capacity: 999 }).expect(200);

      const catalogue = await http()
        .get('/venues')
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(catalogue.body[0].capacity).toBe(999);
    });

    it('persists to the database', async () => {
      const venue = await seedVenue();

      await patch(venue.id, { operatingInfo: 'Weekends only' }).expect(200);

      const stored = await prisma.venue.findUniqueOrThrow({ where: { id: venue.id } });
      expect(stored.operatingInfo).toBe('Weekends only');
    });
  });

  describe('AC-3: warning when existing bookings may be affected', () => {
    it('warns when capacity is reduced on a venue with a live booking', async () => {
      const venue = await seedVenue();
      const booking = await seedBooking(venue.id);

      const res = await patch(venue.id, { capacity: 100 }).expect(200);

      expect(res.body.warnings).toHaveLength(1);
      expect(res.body.warnings[0].code).toBe('BOOKINGS_MAY_NEED_REVIEW');
      expect(res.body.warnings[0].affectedBookingIds).toEqual([booking.id]);
      expect(res.body.warnings[0].message).toMatch(/capacity reduced from 420 to 100/);
    });

    it('applies the change anyway — a warning is not a rejection', async () => {
      const venue = await seedVenue();
      await seedBooking(venue.id);

      await patch(venue.id, { capacity: 100 }).expect(200);

      const stored = await prisma.venue.findUniqueOrThrow({ where: { id: venue.id } });
      expect(stored.capacity).toBe(100);
    });

    it('records a durable notification for the staff member', async () => {
      const venue = await seedVenue();
      await seedBooking(venue.id);

      await patch(venue.id, { capacity: 100 }).expect(200);

      const notes = await prisma.notification.findMany({
        where: { recipientId: ids.staffA },
      });
      expect(notes).toHaveLength(1);
      expect(notes[0].type).toBe(NotificationType.VENUE_CHANGED_BOOKINGS_AFFECTED);
    });

    it('warns when a layout is withdrawn', async () => {
      const venue = await seedVenue();
      await seedBooking(venue.id);

      const res = await patch(venue.id, { supportedLayouts: ['THEATRE'] }).expect(200);

      expect(res.body.warnings[0].reasons.join(' ')).toMatch(/CLASSROOM/);
    });

    // Story 14, AC-3. Losing an accessibility feature can make the venue
    // unsuitable for an event already booked there, so it must warn.
    it('warns when an accessibility feature is removed', async () => {
      const venue = await seedVenue();
      const booking = await seedBooking(venue.id);

      const res = await patch(venue.id, { accessibilityFeatures: ['STEP_FREE_ACCESS'] }).expect(200);

      expect(res.body.warnings).toHaveLength(1);
      expect(res.body.warnings[0].reasons.join(' ')).toMatch(/HEARING_LOOP/);
      expect(res.body.warnings[0].affectedBookingIds).toEqual([booking.id]);
    });

    // Story 14, AC-3. A new location changes what attendees were told, so the
    // existing booking may need review even though nothing else changed.
    it('warns when the venue is relocated', async () => {
      const venue = await seedVenue();
      await seedBooking(venue.id);

      const res = await patch(venue.id, { location: 'Annex Building, Level 3' }).expect(200);

      expect(res.body.warnings).toHaveLength(1);
      expect(res.body.warnings[0].code).toBe('BOOKINGS_MAY_NEED_REVIEW');
    });

    // Story 14, AC-3 ("active or upcoming bookings"). A pending request is
    // upcoming too — it could still be approved into the reduced venue.
    it('treats a pending (not yet approved) booking as upcoming too', async () => {
      const venue = await seedVenue();
      const booking = await seedBooking(venue.id);
      await prisma.venueBooking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.REQUESTED },
      });

      const res = await patch(venue.id, { capacity: 100 }).expect(200);

      expect(res.body.warnings[0].affectedBookingIds).toEqual([booking.id]);
    });

    it('does not warn when capacity increases', async () => {
      const venue = await seedVenue();
      await seedBooking(venue.id);

      const res = await patch(venue.id, { capacity: 900 }).expect(200);

      expect(res.body.warnings).toEqual([]);
    });

    it('does not warn when the venue has no live bookings', async () => {
      const venue = await seedVenue();

      const res = await patch(venue.id, { capacity: 10 }).expect(200);

      expect(res.body.warnings).toEqual([]);
    });

    it('ignores a booking that has already finished', async () => {
      const venue = await seedVenue();
      const event = await prisma.eventRequest.create({
        data: {
          organiserId: ids.organiser,
          name: 'Past event',
          purpose: 'p',
          description: 'd',
          category: 'c',
          proposedStart: new Date('2020-01-01T09:00:00Z'),
          proposedEnd: new Date('2020-01-01T17:00:00Z'),
          expectedAttendance: 10,
          status: EventStatus.COMPLETED,
        },
      });
      await prisma.venueBooking.create({
        data: {
          eventId: event.id,
          venueId: venue.id,
          start: new Date('2020-01-01T08:00:00Z'),
          end: new Date('2020-01-01T18:00:00Z'),
          status: BookingStatus.APPROVED,
        },
      });

      const res = await patch(venue.id, { capacity: 10 }).expect(200);

      expect(res.body.warnings).toEqual([]);
    });

    it('ignores a rejected booking', async () => {
      const venue = await seedVenue();
      const booking = await seedBooking(venue.id);
      await prisma.venueBooking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.REJECTED },
      });

      const res = await patch(venue.id, { capacity: 10 }).expect(200);

      expect(res.body.warnings).toEqual([]);
    });
  });

  describe('AC-4: a required field cannot be left blank', () => {
    it.each([
      ['name', { name: null }],
      ['location', { location: null }],
      ['capacity', { capacity: null }],
    ])('refuses to clear %s on a published venue', async (_label, body) => {
      const venue = await seedVenue();

      const res = await patch(venue.id, body).expect(400);
      expect((res.body.message as string[]).join(' | ')).toMatch(/is required/);

      const stored = await prisma.venue.findUniqueOrThrow({ where: { id: venue.id } });
      expect(stored.name).toBe('Sandbox Auditorium');
    });

    it('treats an empty string as blank', async () => {
      const venue = await seedVenue();

      await patch(venue.id, { name: '   ' }).expect(400);
    });

    it('allows clearing on a draft, which may be incomplete', async () => {
      const venue = await seedVenue({ status: VenueStatus.DRAFT });

      await patch(venue.id, { name: null }).expect(200);

      const stored = await prisma.venue.findUniqueOrThrow({ where: { id: venue.id } });
      expect(stored.name).toBeNull();
    });

    it('still allows replacing a required field with a real value', async () => {
      const venue = await seedVenue();

      const res = await patch(venue.id, { name: 'Renamed Hall' }).expect(200);
      expect(res.body.name).toBe('Renamed Hall');
    });
  });
});
