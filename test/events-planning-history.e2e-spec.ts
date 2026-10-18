import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BookingStatus,
  EventStatus,
  PrismaClient,
  ReservationStatus,
  Role,
  VenueStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';

/**
 * US-24 e2e — update event information during planning.
 * US-25 e2e — view the history of changes made to an event's information.
 */
describe('US-24 planning edits / US-25 change history (e2e)', () => {
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
        coordinatorId: ids.coordinatorA,
        name: 'Freshman Orientation 2030',
        purpose: 'Welcome new students',
        description: 'Full-day programme',
        category: 'Student engagement',
        proposedStart: new Date('2030-10-01T09:00:00Z'),
        proposedEnd: new Date('2030-10-01T17:00:00Z'),
        expectedAttendance: 320,
        equipmentNeeds: 'Two projectors',
        status: EventStatus.PLANNING,
        ...overrides,
      },
    });

  const bookVenue = async (eventId: string, status: BookingStatus) => {
    const venue = await prisma.venue.create({
      data: {
        name: `Auditorium ${eventId}`,
        location: 'Level 1',
        capacity: 420,
        facilities: [],
        accessibilityFeatures: [],
        status: VenueStatus.PUBLISHED,
        managedById: ids.venueStaff,
      },
    });
    await prisma.venueBooking.create({
      data: {
        eventId,
        venueId: venue.id,
        start: new Date('2030-10-01T08:00:00Z'),
        end: new Date('2030-10-01T18:00:00Z'),
        status,
      },
    });
  };

  const reserveEquipment = async (eventId: string, status: ReservationStatus) => {
    const equipment = await prisma.equipment.create({
      data: { type: `Projector ${eventId}`, totalQuantity: 4 },
    });
    await prisma.equipmentReservation.create({
      data: {
        eventId,
        equipmentId: equipment.id,
        quantity: 2,
        start: new Date('2030-10-01T08:00:00Z'),
        end: new Date('2030-10-01T18:00:00Z'),
        status,
      },
    });
  };

  const edit = (eventId: string, body: Record<string, unknown>, who = 'coordinatorA') =>
    http().patch(`/events/${eventId}/planning`).set('Authorization', as(who)).send(body);

  const history = (eventId: string, who = 'coordinatorA') =>
    http().get(`/events/${eventId}/history`).set('Authorization', as(who));

  const cleanUp = async () => {
    // Events first: bookings, reservations and history cascade from them.
    await prisma.notification.deleteMany();
    await prisma.clarificationMessage.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.venue.deleteMany();
    await prisma.equipment.deleteMany();
    await prisma.user.deleteMany();
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
    await cleanUp();
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await cleanUp();

    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('coordinatorA', 'coord.a@example.com', Role.EVENT_COORDINATOR);
    await seedUser('coordinatorB', 'coord.b@example.com', Role.EVENT_COORDINATOR);
    await seedUser('venueStaff', 'venue@example.com', Role.VENUE_STAFF);
    await seedUser('tech', 'tech@example.com', Role.TECHNICAL_SUPPORT_STAFF);
    await seedUser('attendee', 'attendee@example.com', Role.ATTENDEE);
  });

  describe('US-24 AC-1: edits during planning are saved', () => {
    it('saves the programme and attendance to the event record', async () => {
      const event = await seedEvent();

      const res = await edit(event.id, {
        programme: '09:00 Welcome\n10:00 Campus tour',
        expectedAttendance: 350,
      }).expect(200);

      expect(res.body.programme).toBe('09:00 Welcome\n10:00 Campus tour');
      expect(res.body.expectedAttendance).toBe(350);

      const stored = await prisma.eventRequest.findUniqueOrThrow({ where: { id: event.id } });
      expect(stored.programme).toBe('09:00 Welcome\n10:00 Campus tour');
      expect(stored.expectedAttendance).toBe(350);
    });

    it('leaves fields that were not sent untouched', async () => {
      const event = await seedEvent();

      await edit(event.id, { expectedAttendance: 350 }).expect(200);

      const stored = await prisma.eventRequest.findUniqueOrThrow({ where: { id: event.id } });
      expect(stored.name).toBe('Freshman Orientation 2030');
      expect(stored.equipmentNeeds).toBe('Two projectors');
    });

    it('does not change the status', async () => {
      const event = await seedEvent();

      const res = await edit(event.id, { expectedAttendance: 350 }).expect(200);

      expect(res.body.status).toBe(EventStatus.PLANNING);
    });

    it('refuses an event that is not in planning', async () => {
      const event = await seedEvent({ status: EventStatus.UNDER_REVIEW });

      await edit(event.id, { expectedAttendance: 350 }).expect(409);
    });

    it('refuses a Coordinator the event is not assigned to', async () => {
      const event = await seedEvent();

      await edit(event.id, { expectedAttendance: 350 }, 'coordinatorB').expect(404);
    });

    it('refuses an Organiser, even for their own event', async () => {
      const event = await seedEvent();

      await edit(event.id, { expectedAttendance: 350 }, 'organiser').expect(403);
    });

    it('rejects emptying a required field', async () => {
      const event = await seedEvent();

      const res = await edit(event.id, { name: '' }).expect(400);
      expect(res.body.message).toContain('name cannot be empty');

      await edit(event.id, { name: null }).expect(400);
    });

    it('rejects an end before the stored start', async () => {
      const event = await seedEvent();

      await edit(event.id, { proposedEnd: '2030-10-01T08:00:00Z' }).expect(400);
    });

    it('moves an approved event into planning', async () => {
      const event = await seedEvent({ status: EventStatus.APPROVED });

      const res = await http()
        .post(`/events/${event.id}/start-planning`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      expect(res.body.status).toBe(EventStatus.PLANNING);
    });
  });

  describe('US-24 AC-2: changes to confirmed arrangements are flagged for review', () => {
    it('flags an attendance change when the venue booking is approved', async () => {
      const event = await seedEvent();
      await bookVenue(event.id, BookingStatus.APPROVED);

      const res = await edit(event.id, { expectedAttendance: 500 }).expect(200);

      expect(res.body.change.requiresReview).toBe(true);
      expect(res.body.change.affectedArrangements).toEqual(['VENUE_BOOKING']);
    });

    it('flags a date change against both venue and equipment', async () => {
      const event = await seedEvent();
      await bookVenue(event.id, BookingStatus.APPROVED);
      await reserveEquipment(event.id, ReservationStatus.APPROVED);

      const res = await edit(event.id, {
        proposedStart: '2030-10-02T09:00:00Z',
        proposedEnd: '2030-10-02T17:00:00Z',
      }).expect(200);

      expect(res.body.change.affectedArrangements).toEqual([
        'VENUE_BOOKING',
        'EQUIPMENT_RESERVATION',
      ]);
    });

    it('treats the change as ordinary when the booking is only requested', async () => {
      const event = await seedEvent();
      await bookVenue(event.id, BookingStatus.REQUESTED);

      const res = await edit(event.id, { expectedAttendance: 500 }).expect(200);

      expect(res.body.change.requiresReview).toBe(false);
    });

    it('treats a programme change as ordinary even with confirmed arrangements', async () => {
      const event = await seedEvent();
      await bookVenue(event.id, BookingStatus.APPROVED);

      const res = await edit(event.id, { programme: 'Revised running order' }).expect(200);

      expect(res.body.change.requiresReview).toBe(false);
      expect(res.body.change.affectedArrangements).toEqual([]);
    });

    it('persists the flag on the history entry', async () => {
      const event = await seedEvent();
      await bookVenue(event.id, BookingStatus.APPROVED);
      await edit(event.id, { expectedAttendance: 500 }).expect(200);

      const res = await history(event.id).expect(200);

      expect(res.body.entries[0].requiresReview).toBe(true);
    });
  });

  describe('US-24 AC-3: relevant users see the latest saved information', () => {
    it('shows Venue Staff the updated event when it has a booking', async () => {
      const event = await seedEvent();
      await bookVenue(event.id, BookingStatus.APPROVED);
      await edit(event.id, { expectedAttendance: 500 }).expect(200);

      const res = await http()
        .get(`/events/${event.id}`)
        .set('Authorization', as('venueStaff'))
        .expect(200);

      expect(res.body.expectedAttendance).toBe(500);
    });

    it('shows Technical Support the updated equipment needs', async () => {
      const event = await seedEvent();
      await reserveEquipment(event.id, ReservationStatus.REQUESTED);
      await edit(event.id, { equipmentNeeds: 'Three projectors' }).expect(200);

      const res = await http()
        .get(`/events/${event.id}`)
        .set('Authorization', as('tech'))
        .expect(200);

      expect(res.body.equipmentNeeds).toBe('Three projectors');
    });

    it('lists only related events for staff', async () => {
      const booked = await seedEvent();
      await bookVenue(booked.id, BookingStatus.APPROVED);
      await seedEvent({ name: 'Unrelated event' });

      const res = await http()
        .get('/events')
        .set('Authorization', as('venueStaff'))
        .expect(200);

      expect(res.body.map((e: { id: string }) => e.id)).toEqual([booked.id]);
    });

    it('hides an event with no booking from Venue Staff', async () => {
      const event = await seedEvent();

      await http()
        .get(`/events/${event.id}`)
        .set('Authorization', as('venueStaff'))
        .expect(404);
    });

    it('shows the assigned Coordinator the update too', async () => {
      const event = await seedEvent();
      await edit(event.id, { programme: 'New programme' }).expect(200);

      const res = await http()
        .get(`/events/assigned/${event.id}`)
        .set('Authorization', as('coordinatorA'))
        .expect(200);

      expect(res.body.programme).toBe('New programme');
    });
  });

  describe('US-25 AC-1: a chronological list of changes', () => {
    it('lists changes oldest first', async () => {
      const event = await seedEvent();
      await edit(event.id, { expectedAttendance: 350 }).expect(200);
      await edit(event.id, { programme: 'First draft' }).expect(200);
      await edit(event.id, { expectedAttendance: 400 }).expect(200);

      const res = await history(event.id).expect(200);

      expect(
        res.body.entries.map((e: { changes: { field: string }[] }) => e.changes[0].field),
      ).toEqual(['expectedAttendance', 'programme', 'expectedAttendance']);

      const times = res.body.entries.map((e: { createdAt: string }) => Date.parse(e.createdAt));
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    });

    it('does not record a save that changed nothing', async () => {
      const event = await seedEvent();

      const res = await edit(event.id, { expectedAttendance: 320 }).expect(200);
      expect(res.body.change).toBeNull();

      const list = await history(event.id).expect(200);
      expect(list.body.entries).toEqual([]);
    });

    it('includes an Organiser’s amendments to a returned request', async () => {
      const event = await seedEvent({ status: EventStatus.RETURNED });

      await http()
        .patch(`/events/${event.id}`)
        .set('Authorization', as('organiser'))
        .send({ expectedAttendance: 250 })
        .expect(200);

      const res = await history(event.id).expect(200);
      expect(res.body.entries).toHaveLength(1);
      expect(res.body.entries[0].changedBy.id).toBe(ids.organiser);
    });

    it('is not available to a Coordinator who cannot see the event', async () => {
      const event = await seedEvent();

      await history(event.id, 'coordinatorB').expect(404);
    });

    it('is not available to other roles', async () => {
      const event = await seedEvent();

      for (const who of ['organiser', 'venueStaff', 'tech', 'attendee']) {
        await history(event.id, who).expect(403);
      }
    });
  });

  describe('US-25 AC-2: each entry shows what, previous/new, who and when', () => {
    it('records every changed field with its previous and new value', async () => {
      const event = await seedEvent();

      await edit(event.id, {
        expectedAttendance: 350,
        proposedEnd: '2030-10-01T18:00:00Z',
      }).expect(200);

      const res = await history(event.id).expect(200);
      const [entry] = res.body.entries;

      expect(entry.changes).toEqual([
        {
          field: 'proposedEnd',
          previous: '2030-10-01T17:00:00.000Z',
          next: '2030-10-01T18:00:00.000Z',
        },
        { field: 'expectedAttendance', previous: 320, next: 350 },
      ]);
      expect(entry.changedBy).toEqual({
        id: ids.coordinatorA,
        name: 'coordinatorA',
        email: 'coord.a@example.com',
        role: Role.EVENT_COORDINATOR,
      });
      expect(Number.isNaN(Date.parse(entry.createdAt))).toBe(false);
    });
  });

  describe('US-25 AC-3: no changes recorded', () => {
    it('says so explicitly', async () => {
      const event = await seedEvent();

      const res = await history(event.id).expect(200);

      expect(res.body.entries).toEqual([]);
      expect(res.body.message).toBe(
        'No changes have been recorded for this event since it was created.',
      );
    });
  });
});
