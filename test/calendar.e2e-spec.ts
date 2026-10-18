import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus, EventStatus, PrismaClient, Role, VenueStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { listenOnLoopback } from './listen-on-loopback';

/** US-16 e2e — Venue Availability Calendar. */
describe('US-16 venue availability calendar (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const at = (day: number, hour: number) =>
    `2030-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`;
  const week = { from: at(1, 0), to: at(8, 0) };
  const calendar = (query: Record<string, string> = {}, who = 'staff') =>
    http().get('/calendar').query({ ...week, ...query }).set('Authorization', as(who));

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: key, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  const seedVenue = (name: string, managedById: string, status: VenueStatus = VenueStatus.PUBLISHED) =>
    prisma.venue.create({
      data: { name, location: 'Campus', capacity: 200, facilities: [], accessibilityFeatures: [], status, managedById },
    });

  const seedEvent = (name = 'Showcase') =>
    prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        coordinatorId: ids.coordinator,
        name,
        purpose: 'p',
        description: 'd',
        category: 'c',
        proposedStart: new Date(at(2, 9)),
        proposedEnd: new Date(at(2, 12)),
        expectedAttendance: 80,
        status: EventStatus.APPROVED,
      },
    });

  const seedBooking = async (venueId: string, name: string, status: BookingStatus, day = 2) => {
    const event = await seedEvent(name);
    return prisma.venueBooking.create({
      data: {
        eventId: event.id,
        venueId,
        start: new Date(at(day, 9)),
        end: new Date(at(day, 12)),
        status,
        expectedAttendance: 80,
        requestedById: ids.coordinator,
      },
    });
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await listenOnLoopback(app);
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.bookingDecision.deleteMany();
    await prisma.venueBlock.deleteMany();
    await prisma.venueBooking.deleteMany();
    await prisma.venue.deleteMany();
    await prisma.clarificationMessage.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();

    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);
    await seedUser('staff', 'staff@example.com', Role.VENUE_STAFF);
    await seedUser('otherStaff', 'other.staff@example.com', Role.VENUE_STAFF);

    ids.hall = (await seedVenue('Main Hall', ids.staff)).id;
    ids.room = (await seedVenue('Seminar Room', ids.staff)).id;
    ids.draft = (await seedVenue('Draft Venue', ids.staff, VenueStatus.DRAFT)).id;
    ids.foreign = (await seedVenue('Other Venue', ids.otherStaff)).id;
  });

  describe('AC-1: my venues, slots distinguished by status', () => {
    it('shows my published venues and tentative, confirmed and blocked slots', async () => {
      await seedBooking(ids.hall, 'Pending talk', BookingStatus.REQUESTED, 2);
      await seedBooking(ids.hall, 'Confirmed gala', BookingStatus.APPROVED, 3);
      await seedBooking(ids.hall, 'Rejected one', BookingStatus.REJECTED, 4);
      await seedBooking(ids.foreign, 'Not mine', BookingStatus.APPROVED, 2);
      await prisma.venueBlock.create({
        data: { venueId: ids.room, start: new Date(at(5, 0)), end: new Date(at(6, 0)), reason: 'Holiday', createdById: ids.staff },
      });

      const res = await calendar();

      expect(res.status).toBe(200);
      expect(res.body.venues.map((v: { name: string }) => v.name)).toEqual(['Main Hall', 'Seminar Room']);
      expect(res.body.entries.map((e: { kind: string; eventName: string | null; reason: string | null }) => [e.kind, e.eventName ?? e.reason]))
        .toEqual([
          // US-54: TENTATIVE now means a live hold; a pending request is PENDING.
          ['PENDING', 'Pending talk'],
          ['CONFIRMED', 'Confirmed gala'],
          ['BLOCKED', 'Holiday'],
        ]);
    });

    it('is denied to a Coordinator (403)', async () => {
      expect((await calendar({}, 'coordinator')).status).toBe(403);
    });
  });

  describe('AC-2: day/week/month windows', () => {
    it('only returns entries in the requested window', async () => {
      await seedBooking(ids.hall, 'In window', BookingStatus.APPROVED, 2);
      await seedBooking(ids.hall, 'Next week', BookingStatus.APPROVED, 20);

      const res = await calendar();

      expect(res.body.entries.map((e: { eventName: string }) => e.eventName)).toEqual(['In window']);
    });

    it('rejects a window over six weeks, or one that ends before it starts (400)', async () => {
      expect((await calendar({ to: '2030-12-31T00:00:00.000Z' })).status).toBe(400);
      expect((await calendar({ to: at(1, 0), from: at(5, 0) })).status).toBe(400);
    });
  });

  describe('AC-3: filter to one venue', () => {
    it('narrows the venues and entries to the chosen venue', async () => {
      await seedBooking(ids.hall, 'Hall event', BookingStatus.APPROVED, 2);
      await seedBooking(ids.room, 'Room event', BookingStatus.APPROVED, 2);

      const res = await calendar({ venueId: ids.room });

      expect(res.body.venues.map((v: { id: string }) => v.id)).toEqual([ids.room]);
      expect(res.body.entries.map((e: { eventName: string }) => e.eventName)).toEqual(['Room event']);
    });

    it('returns nothing for a venue I do not manage', async () => {
      await seedBooking(ids.foreign, 'Not mine', BookingStatus.APPROVED, 2);

      const res = await calendar({ venueId: ids.foreign });

      expect(res.body).toEqual({ venues: [], entries: [] });
    });
  });

  describe('AC-4: a booked slot carries its details', () => {
    it('includes event name, organiser, time and attendance', async () => {
      const booking = await seedBooking(ids.hall, 'Gala', BookingStatus.APPROVED, 2);

      const [entry] = (await calendar()).body.entries;

      expect(entry).toMatchObject({
        id: booking.id,
        eventName: 'Gala',
        organiserName: 'organiser',
        start: at(2, 9),
        end: at(2, 12),
        expectedAttendance: 80,
      });
    });
  });

  describe('AC-5: reflects changes on refresh', () => {
    it('shows a booking as confirmed on the next read after it is approved', async () => {
      const booking = await seedBooking(ids.hall, 'Talk', BookingStatus.REQUESTED, 2);
      expect((await calendar()).body.entries[0].kind).toBe('PENDING');

      await http().post(`/bookings/${booking.id}/approve`).set('Authorization', as('staff')).send({});

      const res = await calendar();
      expect(res.body.entries[0].kind).toBe('CONFIRMED');
      expect(res.headers['cache-control']).toBe('no-store');
    });
  });

  describe('AC-6: blocked-out periods', () => {
    const block = (body: Record<string, string>, who = 'staff') =>
      http().post('/calendar/blocks').set('Authorization', as(who)).send(body);

    it('blocks out time, which then appears as BLOCKED', async () => {
      const res = await block({ venueId: ids.hall, start: at(3, 0), end: at(4, 0), reason: 'Maintenance' });

      expect(res.status).toBe(201);
      const [entry] = (await calendar()).body.entries;
      expect(entry).toMatchObject({ kind: 'BLOCKED', reason: 'Maintenance', createdByName: 'staff' });
    });

    it('requires a reason and an end after the start (400)', async () => {
      expect((await block({ venueId: ids.hall, start: at(3, 0), end: at(4, 0), reason: '' })).status).toBe(400);
      expect((await block({ venueId: ids.hall, start: at(4, 0), end: at(3, 0), reason: 'x' })).status).toBe(400);
    });

    it('refuses a venue I do not manage (404) and a Coordinator (403)', async () => {
      expect((await block({ venueId: ids.foreign, start: at(3, 0), end: at(4, 0), reason: 'x' })).status).toBe(404);
      expect((await block({ venueId: ids.hall, start: at(3, 0), end: at(4, 0), reason: 'x' }, 'coordinator')).status).toBe(403);
    });

    it('reports existing bookings inside the new block', async () => {
      const booking = await seedBooking(ids.hall, 'Gala', BookingStatus.APPROVED, 2);

      const res = await block({ venueId: ids.hall, start: at(2, 0), end: at(3, 0), reason: 'Leak' });

      expect(res.body.overlappingBookings).toEqual([expect.objectContaining({ bookingId: booking.id })]);
    });

    it('stops a Coordinator requesting, and staff approving, inside a block', async () => {
      const pending = await seedBooking(ids.hall, 'Pending', BookingStatus.REQUESTED, 2);
      await block({ venueId: ids.hall, start: at(2, 0), end: at(3, 0), reason: 'Maintenance' });

      const approve = await http().post(`/bookings/${pending.id}/approve`).set('Authorization', as('staff')).send({});
      expect(approve.status).toBe(409);
      expect(approve.body.conflicts).toEqual([expect.objectContaining({ kind: 'BLOCK', reason: 'Maintenance' })]);

      const event = await seedEvent('New one');
      const requestRes = await http()
        .post('/bookings')
        .set('Authorization', as('coordinator'))
        .send({ eventId: event.id, venueId: ids.hall, start: at(2, 13), end: at(2, 15), expectedAttendance: 50 });
      expect(requestRes.status).toBe(409);
    });

    it('removes a block', async () => {
      const created = await block({ venueId: ids.hall, start: at(3, 0), end: at(4, 0), reason: 'Maintenance' });

      expect((await http().delete(`/calendar/blocks/${created.body.id}`).set('Authorization', as('otherStaff'))).status).toBe(404);
      expect((await http().delete(`/calendar/blocks/${created.body.id}`).set('Authorization', as('staff'))).status).toBe(204);
      expect((await calendar()).body.entries).toEqual([]);
    });
  });
});
