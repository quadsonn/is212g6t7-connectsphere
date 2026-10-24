import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AccessibilityFeature,
  BookingStatus,
  EventStatus,
  Facility,
  PrismaClient,
  Role,
  RoomLayout,
  VenueStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { listenOnLoopback } from './listen-on-loopback';

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
    await listenOnLoopback(app);

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
    await prisma.equipment.deleteMany();
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

    describe('Story 20 AC-2: the technical requirements travel with the request', () => {
      const seedTechnicalEvent = async () => {
        const event = await seedEvent({
          requiredFacilities: [Facility.PROJECTOR, Facility.STAGE],
          technicalSupportNeeds: 'A technician on site for sound checks',
        });
        const projector = await prisma.equipment.create({
          data: { type: 'Projector', totalQuantity: 4 },
        });
        // Created in order, so the copy keeps the order they were entered in.
        await prisma.equipmentRequirement.create({
          data: { eventId: event.id, equipmentId: projector.id, equipmentType: 'Projector', quantity: 2, notes: 'HDMI' },
        });
        await prisma.equipmentRequirement.create({
          data: { eventId: event.id, equipmentType: 'Fog machine', quantity: 1 },
        });
        return event;
      };

      it('Given equipment lines, technical support and facilities, When submitted, Then all are attached', async () => {
        const event = await seedTechnicalEvent();

        const res = await book({ eventId: event.id, venueId: ids.venue, ...slot(9, 12), expectedAttendance: 120 });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({
          requiredFacilities: ['PROJECTOR', 'STAGE'],
          technicalSupportNeeds: 'A technician on site for sound checks',
          equipmentRequirements: [
            { equipmentType: 'Projector', quantity: 2, notes: 'HDMI' },
            { equipmentType: 'Fog machine', quantity: 1, notes: null },
          ],
          // The free-text notes are still attached alongside.
          equipmentNeeds: '2 wireless mics',
        });
      });

      it('Given the venue manager opens the request, Then they see them without opening the event', async () => {
        const event = await seedTechnicalEvent();
        const created = await book({ eventId: event.id, venueId: ids.venue, ...slot(9, 12), expectedAttendance: 120 });

        const res = await http()
          .get(`/bookings/${created.body.id}`)
          .set('Authorization', as('staff'))
          .expect(200);

        expect(res.body.equipmentRequirements).toHaveLength(2);
        expect(res.body.technicalSupportNeeds).toBe('A technician on site for sound checks');
        expect(res.body.requiredFacilities).toEqual(['PROJECTOR', 'STAGE']);
      });

      it('Given the event changes after submission, Then the request keeps what was submitted', async () => {
        const event = await seedTechnicalEvent();
        const created = await book({ eventId: event.id, venueId: ids.venue, ...slot(9, 12), expectedAttendance: 120 });

        await prisma.equipmentRequirement.deleteMany({ where: { eventId: event.id } });
        await prisma.eventRequest.update({
          where: { id: event.id },
          data: { technicalSupportNeeds: null, requiredFacilities: [] },
        });

        const res = await http()
          .get(`/bookings/${created.body.id}`)
          .set('Authorization', as('staff'))
          .expect(200);
        expect(res.body.equipmentRequirements).toHaveLength(2);
        expect(res.body.technicalSupportNeeds).toBe('A technician on site for sound checks');
        expect(res.body.requiredFacilities).toEqual(['PROJECTOR', 'STAGE']);
      });

      it('Given none recorded, Then the request carries an empty list, not "not recorded"', async () => {
        const event = await seedEvent();

        const res = await book({ eventId: event.id, venueId: ids.venue, ...slot(9, 12), expectedAttendance: 120 });

        expect(res.body).toMatchObject({
          equipmentRequirements: [],
          technicalSupportNeeds: null,
          requiredFacilities: [],
        });
      });

      it('Given a request made before this was attached, Then its list reads as not recorded (null)', async () => {
        const event = await seedEvent();
        const old = await prisma.venueBooking.create({
          data: {
            eventId: event.id,
            venueId: ids.venue,
            requestedById: ids.coordinator,
            start: new Date(slot(9, 12).start),
            end: new Date(slot(9, 12).end),
          },
        });

        const res = await http().get(`/bookings/${old.id}`).set('Authorization', as('staff')).expect(200);

        expect(res.body.equipmentRequirements).toBeNull();
      });
    });
  });

  describe('Capacity AC-1/AC-2: a venue too small for the expected attendance cannot be requested', () => {
    const lounge = async (capacity: number) =>
      (
        await prisma.venue.create({
          data: {
            name: 'Alumni Lounge',
            location: 'Level 2',
            capacity,
            facilities: [],
            accessibilityFeatures: [],
            status: VenueStatus.PUBLISHED,
            managedById: ids.staff,
          },
        })
      ).id;

    it('Capacity AC-1/AC-2: refuses 499 attendees for a venue holding 90 (409), saying why, and creates nothing', async () => {
      const event = await seedEvent({ expectedAttendance: 499 });
      const venueId = await lounge(90);

      const res = await book({ eventId: event.id, venueId, ...slot(9, 12), expectedAttendance: 499 });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        code: 'CAPACITY_EXCEEDED',
        message: 'Alumni Lounge holds 90, but expected attendance is 499.',
        capacity: 90,
        expectedAttendance: 499,
      });
      expect(await prisma.venueBooking.count()).toBe(0);
    });

    it.each([
      ['equal to', 90],
      ['below', 60],
    ])('Capacity AC-1: allows attendance %s capacity', async (_label, attendance) => {
      const event = await seedEvent({ expectedAttendance: attendance });
      const venueId = await lounge(90);

      const res = await book({ eventId: event.id, venueId, ...slot(9, 12), expectedAttendance: attendance });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe(BookingStatus.REQUESTED);
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
