import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AccessibilityFeature,
  BookingStatus,
  Facility,
  PrismaClient,
  Role,
  VenueStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';

/** US-18 e2e — a Coordinator searching venues by date, capacity and features. */
describe('US-18 search and filter venues (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  /** A slot on 10 March 2027, 09:00–17:00 Singapore time. */
  const SLOT = { from: '2027-03-10T01:00:00.000Z', to: '2027-03-10T09:00:00.000Z' };

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: key, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  const seedVenue = async (
    name: string,
    data: {
      capacity?: number;
      status?: VenueStatus;
      facilities?: Facility[];
      accessibilityFeatures?: AccessibilityFeature[];
    } = {},
  ) => {
    const venue = await prisma.venue.create({
      data: {
        name,
        location: 'Campus',
        capacity: 100,
        status: VenueStatus.PUBLISHED,
        managedById: ids.staff,
        ...data,
      },
    });
    ids[name] = venue.id;
    return venue.id;
  };

  const seedBooking = (venue: string, status: BookingStatus, start = SLOT.from, end = SLOT.to) =>
    prisma.venueBooking.create({
      data: {
        eventId: ids.event,
        venueId: ids[venue],
        start: new Date(start),
        end: new Date(end),
        status,
      },
    });

  const search = (query: Record<string, string | number> = {}, who = 'coordinator') =>
    http().get('/venues/search').query(query).set('Authorization', as(who));

  const names = (body: { name: string }[]) => body.map((v) => v.name).sort();

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
    await prisma.revokedToken.deleteMany();
    await prisma.clarificationMessage.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();

    await seedUser('staff', 'staff@example.com', Role.VENUE_STAFF);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);
    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('attendee', 'attendee@example.com', Role.ATTENDEE);

    const event = await prisma.eventRequest.create({
      data: { organiserId: ids.organiser, name: 'Some event' },
    });
    ids.event = event.id;
  });

  describe('baseline', () => {
    it('US-18: an empty search returns every published venue', async () => {
      await seedVenue('Alpha');
      await seedVenue('Bravo');

      const res = await search().expect(200);

      expect(names(res.body)).toEqual(['Alpha', 'Bravo']);
    });

    it('US-18: never returns a draft venue, even one matching every filter', async () => {
      await seedVenue('Published', { capacity: 500, facilities: [Facility.STAGE] });
      await seedVenue('Draft', {
        capacity: 500,
        facilities: [Facility.STAGE],
        status: VenueStatus.DRAFT,
      });

      const res = await search({ minCapacity: 100, facilities: 'STAGE' }).expect(200);

      expect(names(res.body)).toEqual(['Published']);
    });

    it('US-18: is not cached', async () => {
      const res = await search().expect(200);

      expect(res.headers['cache-control']).toBe('no-store');
    });
  });

  describe('AC-1: date/time excludes venues with a confirmed overlapping booking', () => {
    beforeEach(async () => {
      await seedVenue('Approved');
      await seedVenue('Pending');
      await seedVenue('Rejected');
      await seedVenue('Adjacent');
      await seedVenue('Untouched');

      await seedBooking('Approved', BookingStatus.APPROVED);
      await seedBooking('Pending', BookingStatus.REQUESTED);
      await seedBooking('Rejected', BookingStatus.REJECTED);
      // Ends exactly when the slot starts: back-to-back is not a conflict.
      await seedBooking('Adjacent', BookingStatus.APPROVED, '2027-03-09T23:00:00.000Z', SLOT.from);
    });

    it('excludes a venue with an APPROVED booking overlapping the slot', async () => {
      const res = await search(SLOT).expect(200);

      expect(names(res.body)).not.toContain('Approved');
    });

    it('includes a venue with only a pending (REQUESTED) booking — AC-1 says "confirmed"', async () => {
      const res = await search(SLOT).expect(200);

      expect(names(res.body)).toContain('Pending');
    });

    it('includes venues with a rejected or back-to-back booking', async () => {
      const res = await search(SLOT).expect(200);

      expect(names(res.body)).toEqual(['Adjacent', 'Pending', 'Rejected', 'Untouched']);
    });

    it('includes the approved venue again for a slot that does not overlap', async () => {
      const res = await search({
        from: '2027-03-11T01:00:00.000Z',
        to: '2027-03-11T09:00:00.000Z',
      }).expect(200);

      expect(names(res.body)).toContain('Approved');
    });

    // Story 18, AC-1. The tests above use a booking that matches the slot
    // exactly; real clashes are usually partial, so each shape is checked.
    // Slot is 09:00–17:00 Singapore time (01:00–09:00 UTC) on 10 March 2027.
    it.each([
      ['starts before the slot and runs into it', '2027-03-10T00:00:00.000Z', '2027-03-10T02:00:00.000Z'],
      ['starts inside the slot and runs past it', '2027-03-10T08:00:00.000Z', '2027-03-10T10:00:00.000Z'],
      ['sits entirely inside the slot', '2027-03-10T03:00:00.000Z', '2027-03-10T04:00:00.000Z'],
      ['covers the whole slot and more', '2027-03-09T23:00:00.000Z', '2027-03-10T11:00:00.000Z'],
    ])('excludes a venue whose confirmed booking %s', async (_shape, start, end) => {
      await seedVenue('Partial');
      await seedBooking('Partial', BookingStatus.APPROVED, start, end);

      const res = await search(SLOT).expect(200);

      expect(names(res.body)).not.toContain('Partial');
    });

    it('rejects half a range', async () => {
      await search({ from: SLOT.from }).expect(400);
    });

    it('rejects a range that ends before it starts', async () => {
      await search({ from: SLOT.to, to: SLOT.from }).expect(400);
    });
  });

  describe('AC-2: minimum capacity', () => {
    beforeEach(async () => {
      await seedVenue('Hundred', { capacity: 100 });
      await seedVenue('NinetyNine', { capacity: 99 });
    });

    it('includes a venue whose capacity equals the minimum', async () => {
      const res = await search({ minCapacity: 100 }).expect(200);

      expect(names(res.body)).toEqual(['Hundred']);
    });

    it('excludes a venue one below the minimum', async () => {
      const res = await search({ minCapacity: 101 }).expect(200);

      expect(res.body).toEqual([]);
    });

    it('rejects a non-numeric minimum', async () => {
      await search({ minCapacity: 'lots' }).expect(400);
    });
  });

  describe('AC-3: accessibility requires every selected feature', () => {
    beforeEach(async () => {
      await seedVenue('Both', {
        accessibilityFeatures: [AccessibilityFeature.STEP_FREE_ACCESS, AccessibilityFeature.HEARING_LOOP],
      });
      await seedVenue('StepOnly', {
        accessibilityFeatures: [AccessibilityFeature.STEP_FREE_ACCESS],
      });
    });

    it('matches a venue offering the one selected feature', async () => {
      const res = await search({ accessibility: 'STEP_FREE_ACCESS' }).expect(200);

      expect(names(res.body)).toEqual(['Both', 'StepOnly']);
    });

    it('excludes a venue missing one of several selected features', async () => {
      const res = await search({ accessibility: 'STEP_FREE_ACCESS,HEARING_LOOP' }).expect(200);

      expect(names(res.body)).toEqual(['Both']);
    });

    it('accepts the list as a repeated key', async () => {
      const res = await http()
        .get('/venues/search?accessibility=STEP_FREE_ACCESS&accessibility=HEARING_LOOP')
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(names(res.body)).toEqual(['Both']);
    });

    it('rejects a value outside the shared vocabulary', async () => {
      await search({ accessibility: 'Step-free access' }).expect(400);
    });
  });

  describe('AC-4: facilities require every selected facility', () => {
    beforeEach(async () => {
      await seedVenue('Full', { facilities: [Facility.PROJECTOR, Facility.WIFI, Facility.STAGE] });
      await seedVenue('NoWifi', { facilities: [Facility.PROJECTOR, Facility.STAGE] });
    });

    it('excludes a venue missing one selected facility', async () => {
      const res = await search({ facilities: 'PROJECTOR,WIFI' }).expect(200);

      expect(names(res.body)).toEqual(['Full']);
    });

    // Story 18, AC-4. The positive case: one selected facility returns every
    // venue that has it, however many other facilities those venues offer.
    it('includes every venue offering the selected facility', async () => {
      const res = await search({ facilities: 'STAGE' }).expect(200);

      expect(names(res.body)).toEqual(['Full', 'NoWifi']);
    });

    it('rejects a value outside the Facility vocabulary', async () => {
      await search({ facilities: 'Projector' }).expect(400);
    });
  });

  describe('AC-5: filters combine with AND', () => {
    it('returns only the venue satisfying every dimension at once', async () => {
      const all = {
        capacity: 200,
        facilities: [Facility.PROJECTOR],
        accessibilityFeatures: [AccessibilityFeature.STEP_FREE_ACCESS],
      };
      await seedVenue('Match', all);
      await seedVenue('TooSmall', { ...all, capacity: 50 });
      await seedVenue('NoProjector', { ...all, facilities: [] });
      await seedVenue('NotAccessible', { ...all, accessibilityFeatures: [] });
      await seedVenue('Booked', all);
      await seedBooking('Booked', BookingStatus.APPROVED);

      const res = await search({
        ...SLOT,
        minCapacity: 100,
        facilities: 'PROJECTOR',
        accessibility: 'STEP_FREE_ACCESS',
      }).expect(200);

      expect(names(res.body)).toEqual(['Match']);
    });
  });

  describe('US-15 AC-3 (restored after US-18): name lookup', () => {
    beforeEach(async () => {
      await seedVenue('Sandbox Auditorium', { capacity: 400 });
      await seedVenue('Seminar Room', { capacity: 40 });
      await seedVenue('Draft Auditorium', { status: VenueStatus.DRAFT });
    });

    it('finds a published venue by a case-insensitive name fragment', async () => {
      const res = await search({ name: 'AUDIT' }).expect(200);

      expect(names(res.body)).toEqual(['Sandbox Auditorium']);
    });

    it('combines with the other filters by AND', async () => {
      const res = await search({ name: 'audit', minCapacity: 500 }).expect(200);

      expect(res.body).toEqual([]);
    });
  });

  describe('AC-6: no matches is a valid result', () => {
    it('returns 200 with an empty array', async () => {
      await seedVenue('Small', { capacity: 10 });

      const res = await search({ minCapacity: 5000 }).expect(200);

      expect(res.body).toEqual([]);
    });
  });

  describe('AC-7: results within two seconds', () => {
    it('searches 300 venues with 600 bookings in one round trip under 2s', async () => {
      const facilities = Object.values(Facility);
      const access = Object.values(AccessibilityFeature);

      await prisma.venue.createMany({
        data: Array.from({ length: 300 }, (_, i) => ({
          name: `Venue ${String(i).padStart(3, '0')}`,
          location: 'Campus',
          capacity: 20 + (i % 50) * 10,
          status: i % 10 === 0 ? VenueStatus.DRAFT : VenueStatus.PUBLISHED,
          facilities: facilities.filter((_, j) => (i + j) % 3 === 0),
          accessibilityFeatures: access.filter((_, j) => (i + j) % 2 === 0),
          managedById: ids.staff,
        })),
      });
      const venues = await prisma.venue.findMany({ select: { id: true } });
      await prisma.venueBooking.createMany({
        data: venues.flatMap((venue, i) =>
          [0, 1].map((k) => ({
            eventId: ids.event,
            venueId: venue.id,
            start: new Date(Date.parse(SLOT.from) + (i % 5 - 2 + k * 3) * 3_600_000),
            end: new Date(Date.parse(SLOT.to) + (i % 5 - 2 + k * 3) * 3_600_000),
            status: k === 0 ? BookingStatus.APPROVED : BookingStatus.REQUESTED,
          })),
        ),
      });

      const started = Date.now();
      const res = await search({
        ...SLOT,
        minCapacity: 100,
        facilities: 'PROJECTOR',
        accessibility: 'STEP_FREE_ACCESS',
      }).expect(200);

      expect(Date.now() - started).toBeLessThan(2000);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('access: Coordinators only', () => {
    it.each(['staff', 'organiser', 'attendee'])('refuses %s with 403', async (who) => {
      await search({}, who).expect(403);
    });

    it('refuses an unauthenticated caller', async () => {
      await http().get('/venues/search').expect(401);
    });
  });
});
