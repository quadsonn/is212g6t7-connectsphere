import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AccessibilityFeature,
  BookingStatus,
  EventStatus,
  PrismaClient,
  Role,
  RoomLayout,
  VenueStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';

/** US-21 e2e — submit a request to book a venue with timing and requirements. */
describe('US-21 submit a venue booking request (e2e)', () => {
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

  const seedEvent = async (overrides: Record<string, unknown> = {}) =>
    prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        coordinatorId: ids.coordinator,
        name: 'Orientation',
        purpose: 'Welcome',
        description: 'Programme',
        category: 'Student engagement',
        proposedStart: new Date('2030-10-01T09:00:00Z'),
        proposedEnd: new Date('2030-10-01T12:00:00Z'),
        expectedAttendance: 120,
        preferredLayout: RoomLayout.THEATRE,
        accessibilityRequirements: [AccessibilityFeature.HEARING_LOOP],
        accessibilityNotes: 'Two hearing aid users',
        equipmentNeeds: '2 wireless mics',
        status: EventStatus.APPROVED,
        ...overrides,
      },
    });

  const book = (body: Record<string, unknown>, who = 'coordinator') =>
    http().post('/bookings').set('Authorization', as(who)).send(body);

  const slot = (startHour: number, endHour: number) => ({
    start: `2030-10-01T${String(startHour).padStart(2, '0')}:00:00.000Z`,
    end: `2030-10-01T${String(endHour).padStart(2, '0')}:00:00.000Z`,
  });

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

    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);
    await seedUser('otherCoordinator', 'other.coord@example.com', Role.EVENT_COORDINATOR);
    await seedUser('staff', 'staff@example.com', Role.VENUE_STAFF);

    const venue = await prisma.venue.create({
      data: {
        name: 'Sandbox Auditorium',
        location: 'Level 1',
        capacity: 420,
        facilities: [],
        accessibilityFeatures: [],
        status: VenueStatus.PUBLISHED,
        managedById: ids.staff,
      },
    });
    ids.venue = venue.id;
  });

  describe('AC-1: date, times and attendance are required', () => {
    it('rejects a request missing them, flagging each field', async () => {
      const event = await seedEvent();

      const res = await book({ eventId: event.id, venueId: ids.venue });

      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          'start must be a valid ISO 8601 date',
          'end must be a valid ISO 8601 date',
          'expectedAttendance must be a whole number',
        ]),
      );
    });
  });

  // Story 20 (US-21 in code), AC-1. The form checks these in the browser, but
  // the API is the real gate, so each bad value must be refused there too.
  describe('AC-1: invalid values are refused, not just missing ones', () => {
    it.each([
      ['a start in the past', { start: '2020-01-01T09:00:00.000Z', end: '2020-01-01T12:00:00.000Z' }, 'start must be in the future'],
      ['an end before the start', { start: '2030-10-01T12:00:00.000Z', end: '2030-10-01T09:00:00.000Z' }, 'end must be later than start'],
      ['zero attendance', { expectedAttendance: 0 }, 'expectedAttendance must be greater than zero'],
      ['fractional attendance', { expectedAttendance: 12.5 }, 'expectedAttendance must be a whole number'],
    ])('refuses %s (400) and creates nothing', async (_case, override, message) => {
      const event = await seedEvent();

      const res = await book({
        eventId: event.id,
        venueId: ids.venue,
        ...slot(9, 12),
        expectedAttendance: 120,
        ...override,
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain(message);
      expect(await prisma.venueBooking.count()).toBe(0);
    });
  });

  describe('AC-2/AC-3: requirements attached, status pending', () => {
    it('creates a REQUESTED booking carrying the event requirements', async () => {
      const event = await seedEvent();

      const res = await book({
        eventId: event.id,
        venueId: ids.venue,
        ...slot(9, 12),
        expectedAttendance: 120,
      });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        status: BookingStatus.REQUESTED,
        expectedAttendance: 120,
        preferredLayout: RoomLayout.THEATRE,
        accessibilityRequirements: [AccessibilityFeature.HEARING_LOOP],
        accessibilityNotes: 'Two hearing aid users',
        equipmentNeeds: '2 wireless mics',
        venue: { id: ids.venue, name: 'Sandbox Auditorium' },
        event: { id: event.id, name: 'Orientation' },
        warnings: [],
      });
    });
  });

  describe('AC-4: overlapping a confirmed booking is blocked', () => {
    it('returns 409 naming the conflicting booking, and creates nothing', async () => {
      const other = await seedEvent({ name: 'Hackathon' });
      const confirmed = await prisma.venueBooking.create({
        data: {
          eventId: other.id,
          venueId: ids.venue,
          start: new Date(slot(10, 14).start),
          end: new Date(slot(10, 14).end),
          status: BookingStatus.APPROVED,
        },
      });
      const event = await seedEvent();

      const res = await book({
        eventId: event.id,
        venueId: ids.venue,
        ...slot(9, 12),
        expectedAttendance: 120,
      });

      expect(res.status).toBe(409);
      expect(res.body.conflicts).toEqual([
        expect.objectContaining({ bookingId: confirmed.id, eventName: 'Hackathon' }),
      ]);
      expect(await prisma.venueBooking.count({ where: { eventId: event.id } })).toBe(0);
    });

    it('allows a back-to-back slot that only touches the confirmed one', async () => {
      const other = await seedEvent({ name: 'Hackathon' });
      await prisma.venueBooking.create({
        data: {
          eventId: other.id,
          venueId: ids.venue,
          start: new Date(slot(12, 14).start),
          end: new Date(slot(12, 14).end),
          status: BookingStatus.APPROVED,
        },
      });
      const event = await seedEvent();

      const res = await book({
        eventId: event.id,
        venueId: ids.venue,
        ...slot(9, 12),
        expectedAttendance: 120,
      });

      expect(res.status).toBe(201);
    });
  });

  describe('AC-5: overlapping only a pending request is allowed with a warning', () => {
    it('creates the request and warns about the pending one', async () => {
      const other = await seedEvent({ name: 'Hackathon' });
      const pending = await prisma.venueBooking.create({
        data: {
          eventId: other.id,
          venueId: ids.venue,
          start: new Date(slot(10, 14).start),
          end: new Date(slot(10, 14).end),
        },
      });
      const event = await seedEvent();

      const res = await book({
        eventId: event.id,
        venueId: ids.venue,
        ...slot(9, 12),
        expectedAttendance: 120,
      });

      expect(res.status).toBe(201);
      expect(res.body.warnings).toEqual([
        expect.objectContaining({
          code: 'OVERLAPS_PENDING_REQUEST',
          conflicts: [expect.objectContaining({ bookingId: pending.id })],
        }),
      ]);
    });

    // Story 20 (US-21 in code), AC-5. "Warned that a conflicting request
    // exists" is only useful if it says which one — event name and times.
    it('names the conflicting request by event and time range', async () => {
      const other = await seedEvent({ name: 'Hackathon' });
      await prisma.venueBooking.create({
        data: {
          eventId: other.id,
          venueId: ids.venue,
          start: new Date(slot(10, 14).start),
          end: new Date(slot(10, 14).end),
        },
      });
      const event = await seedEvent();

      const res = await book({ eventId: event.id, venueId: ids.venue, ...slot(9, 12), expectedAttendance: 120 });

      expect(res.body.warnings[0].conflicts[0]).toMatchObject({
        eventName: 'Hackathon',
        start: slot(10, 14).start,
        end: slot(10, 14).end,
      });
    });
  });

  describe('AC-6: the request appears in the Coordinator\'s history', () => {
    it('lists it under GET /bookings/mine for the requester only', async () => {
      const event = await seedEvent();
      const created = await book({
        eventId: event.id,
        venueId: ids.venue,
        ...slot(9, 12),
        expectedAttendance: 120,
      });

      const mine = await http()
        .get('/bookings/mine')
        .set('Authorization', as('coordinator'));
      const theirs = await http()
        .get('/bookings/mine')
        .set('Authorization', as('otherCoordinator'));

      expect(mine.status).toBe(200);
      expect(mine.body.map((b: { id: string }) => b.id)).toEqual([created.body.id]);
      expect(theirs.body).toEqual([]);
    });
  });

  describe('authorisation', () => {
    it('denies an Organiser (403)', async () => {
      const event = await seedEvent();

      const res = await book(
        { eventId: event.id, venueId: ids.venue, ...slot(9, 12), expectedAttendance: 120 },
        'organiser',
      );

      expect(res.status).toBe(403);
    });

    it('hides an event assigned to another Coordinator (404)', async () => {
      const event = await seedEvent();

      const res = await book(
        { eventId: event.id, venueId: ids.venue, ...slot(9, 12), expectedAttendance: 120 },
        'otherCoordinator',
      );

      expect(res.status).toBe(404);
    });

    it('refuses an event that has not been approved yet (409)', async () => {
      const event = await seedEvent({ status: EventStatus.SUBMITTED });

      const res = await book({
        eventId: event.id,
        venueId: ids.venue,
        ...slot(9, 12),
        expectedAttendance: 120,
      });

      expect(res.status).toBe(409);
    });
  });

  describe('GET /bookings/:id — full request detail', () => {
    it('is visible to the requester, the event\'s Organiser and the venue\'s manager, hidden from others', async () => {
      await seedUser('otherStaff', 'other.staff@example.com', Role.VENUE_STAFF);
      const event = await seedEvent();
      const created = await book({
        eventId: event.id,
        venueId: ids.venue,
        ...slot(9, 12),
        expectedAttendance: 120,
      });
      const get = (who: string) =>
        http().get(`/bookings/${created.body.id}`).set('Authorization', as(who));

      const requester = await get('coordinator');
      expect(requester.status).toBe(200);
      expect(requester.body).toMatchObject({
        id: created.body.id,
        equipmentNeeds: '2 wireless mics',
        event: { organiser: { id: ids.organiser } },
      });

      expect((await get('staff')).status).toBe(200);
      expect((await get('otherStaff')).status).toBe(404);
      expect((await get('otherCoordinator')).status).toBe(404);
      // US-23 AC-5: the Organiser of the event may see it too.
      expect((await get('organiser')).status).toBe(200);
    });
  });
});
