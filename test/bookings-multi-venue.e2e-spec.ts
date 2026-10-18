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
import { listenOnLoopback } from './listen-on-loopback';

/**
 * US-53 e2e — one event, several venue bookings (Week 7 change 3). One
 * describe per acceptance criterion, named "US-53 AC-n".
 */
describe('US-53 multi-venue booking (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const at = (hhmm: string) => `2030-10-01T${hhmm}:00.000Z`;
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

  const seedVenue = async (key: string, managedBy: string) => {
    const venue = await prisma.venue.create({
      data: {
        name: key,
        location: 'Campus',
        capacity: 300,
        facilities: [],
        accessibilityFeatures: [],
        status: VenueStatus.PUBLISHED,
        managedById: ids[managedBy],
      },
    });
    ids[key] = venue.id;
  };

  const book = (venue: string, body: Record<string, unknown> = {}, who = 'coordinator') =>
    http()
      .post('/bookings')
      .set('Authorization', as(who))
      .send({
        eventId: ids.summit,
        venueId: ids[venue],
        start: at('09:00'),
        end: at('17:00'),
        expectedAttendance: 200,
        ...body,
      });

  const decide = (id: string, action: 'approve' | 'reject', who: string, body: object = {}) =>
    http().post(`/bookings/${id}/${action}`).set('Authorization', as(who)).send(body);

  const release = (id: string, who = 'coordinator') =>
    http().post(`/bookings/${id}/release`).set('Authorization', as(who));

  const arrangement = (who = 'coordinator', event = 'summit') =>
    http().get(`/bookings/events/${ids[event]}/arrangement`).set('Authorization', as(who));

  const eventBookings = (who = 'coordinator') =>
    http().get(`/bookings/events/${ids.summit}`).set('Authorization', as(who));

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
    await seedUser('otherCoordinator', 'other@example.com', Role.EVENT_COORDINATOR);
    await seedUser('hallStaff', 'hall.staff@example.com', Role.VENUE_STAFF);
    await seedUser('roomStaff', 'room.staff@example.com', Role.VENUE_STAFF);
    await seedUser('tech', 'tech@example.com', Role.TECHNICAL_SUPPORT_STAFF);

    // Each venue has its own staff, who decide on it alone.
    await seedVenue('mainHall', 'hallStaff');
    await seedVenue('breakoutA', 'roomStaff');
    await seedVenue('breakoutB', 'roomStaff');

    const event = await prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        coordinatorId: ids.coordinator,
        name: 'Summit',
        purpose: 'p',
        description: 'd',
        category: 'c',
        proposedStart: new Date(at('09:00')),
        proposedEnd: new Date(at('17:00')),
        expectedAttendance: 200,
        preferredLayout: RoomLayout.THEATRE,
        accessibilityRequirements: [AccessibilityFeature.STEP_FREE_ACCESS],
        equipmentNeeds: 'PA system',
        status: EventStatus.PLANNING,
      },
    });
    ids.summit = event.id;
  });

  describe('US-53 AC-1/AC-2: several bookings on one event, each with its own timing and requirements', () => {
    it('adds three bookings to one event with different times and requirements', async () => {
      const hall = await book('mainHall').expect(201);
      const a = await book('breakoutA', {
        start: at('13:00'),
        end: at('15:00'),
        expectedAttendance: 40,
        preferredLayout: RoomLayout.CLASSROOM,
        layoutNotes: 'Workshop tables',
        accessibilityRequirements: [],
        equipmentNeeds: 'Whiteboard',
      }).expect(201);
      const b = await book('breakoutB', {
        start: at('15:00'),
        end: at('16:30'),
        expectedAttendance: 25,
        preferredLayout: RoomLayout.BOARDROOM,
        equipmentNeeds: null,
      }).expect(201);

      // Defaults: copied from the event when not set.
      expect(hall.body).toMatchObject({
        start: at('09:00'),
        end: at('17:00'),
        expectedAttendance: 200,
        preferredLayout: 'THEATRE',
        accessibilityRequirements: ['STEP_FREE_ACCESS'],
        equipmentNeeds: 'PA system',
      });
      // Set per venue.
      expect(a.body).toMatchObject({
        start: at('13:00'),
        end: at('15:00'),
        expectedAttendance: 40,
        preferredLayout: 'CLASSROOM',
        layoutNotes: 'Workshop tables',
        accessibilityRequirements: [],
        equipmentNeeds: 'Whiteboard',
      });
      // Partly set: unset fields still come from the event; null clears.
      expect(b.body).toMatchObject({
        preferredLayout: 'BOARDROOM',
        accessibilityRequirements: ['STEP_FREE_ACCESS'],
        equipmentNeeds: null,
      });

      // All under the same event; the event itself is unchanged.
      expect(await prisma.venueBooking.count({ where: { eventId: ids.summit } })).toBe(3);
      const event = await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.summit } });
      expect(event).toMatchObject({ preferredLayout: 'THEATRE', equipmentNeeds: 'PA system' });
    });

    it('rejects an unknown layout or accessibility value', async () => {
      await book('breakoutA', { preferredLayout: 'TREEHOUSE' }).expect(400);
      await book('breakoutA', { accessibilityRequirements: ['JETPACK'] }).expect(400);
    });
  });

  describe('US-53 AC-3: each venue goes through its own availability and conflict check', () => {
    it("one venue's clash refuses that request only; the event's others go ahead", async () => {
      // breakoutA is held by another event in the afternoon.
      const other = await prisma.eventRequest.create({
        data: {
          organiserId: ids.organiser,
          coordinatorId: ids.otherCoordinator,
          name: 'Other',
          purpose: 'p',
          description: 'd',
          category: 'c',
          status: EventStatus.PLANNING,
          proposedStart: new Date(at('13:00')),
          proposedEnd: new Date(at('14:00')),
          expectedAttendance: 10,
        },
      });
      await prisma.venueBooking.create({
        data: {
          eventId: other.id,
          venueId: ids.breakoutA,
          start: new Date(at('13:00')),
          end: new Date(at('14:00')),
          status: BookingStatus.APPROVED,
        },
      });

      await book('mainHall').expect(201);
      await book('breakoutA', { start: at('13:30'), end: at('15:00') }).expect(409);
      await book('breakoutB', { start: at('13:30'), end: at('15:00') }).expect(201);
    });

    it("the event's own bookings at different venues never conflict with each other", async () => {
      await book('mainHall').expect(201);
      await book('breakoutA').expect(201); // same times, different venue
    });

    it('each is decided independently by its own venue staff', async () => {
      const hall = await book('mainHall').expect(201);
      const a = await book('breakoutA').expect(201);

      // Hall staff cannot decide the breakout room, and vice versa.
      await decide(a.body.id, 'approve', 'hallStaff').expect(404);
      await decide(hall.body.id, 'approve', 'hallStaff').expect(200);
      await decide(a.body.id, 'reject', 'roomStaff', { reason: 'Closed for painting.' }).expect(200);

      // By id, not creation order, which can tie on createdAt.
      expect((await prisma.venueBooking.findUniqueOrThrow({ where: { id: hall.body.id } })).status).toBe(
        BookingStatus.APPROVED,
      );
      expect((await prisma.venueBooking.findUniqueOrThrow({ where: { id: a.body.id } })).status).toBe(
        BookingStatus.REJECTED,
      );
    });
  });

  describe('US-53 AC-4: each booking\'s approval status is shown separately on the event', () => {
    it('lists every booking on the event with its own status and decision', async () => {
      const hall = await book('mainHall').expect(201);
      const a = await book('breakoutA').expect(201);
      await book('breakoutB').expect(201);
      await decide(hall.body.id, 'approve', 'hallStaff').expect(200);
      await decide(a.body.id, 'reject', 'roomStaff', { reason: 'Closed.' }).expect(200);

      const res = await eventBookings().expect(200);

      // Compared regardless of order: the list is ordered by createdAt, which
      // can tie for requests made in the same millisecond.
      expect(
        res.body
          .map((b: { venue: { name: string }; status: string; decisionReason: string | null }) => [
            b.venue.name,
            b.status,
            b.decisionReason,
          ])
          .sort(),
      ).toEqual(
        [
          ['mainHall', 'APPROVED', null],
          ['breakoutA', 'REJECTED', 'Closed.'],
          ['breakoutB', 'REQUESTED', null],
        ].sort(),
      );
    });

    it('is not shown to another Coordinator', async () => {
      await book('mainHall').expect(201);
      await eventBookings('otherCoordinator').expect(200).expect([]);
    });
  });

  describe('US-53 AC-5: venue arranged only when all required venues are approved', () => {
    it('is false with no bookings, false until all approved, true after, false again on a new request', async () => {
      await arrangement().expect(200).expect((res) => expect(res.body.arranged).toBe(false));

      const hall = await book('mainHall').expect(201);
      const a = await book('breakoutA').expect(201);
      await decide(hall.body.id, 'approve', 'hallStaff').expect(200);
      expect((await arrangement().expect(200)).body).toEqual({
        arranged: false,
        activeBookings: 2,
        approvedBookings: 1,
        pendingBookings: 1,
      });

      await decide(a.body.id, 'approve', 'roomStaff').expect(200);
      expect((await arrangement().expect(200)).body).toEqual({
        arranged: true,
        activeBookings: 2,
        approvedBookings: 2,
        pendingBookings: 0,
      });

      await book('breakoutB').expect(201);
      expect((await arrangement().expect(200)).body.arranged).toBe(false);
    });

    it('does not count a rejected or released booking as required', async () => {
      const hall = await book('mainHall').expect(201);
      const a = await book('breakoutA').expect(201);
      const b = await book('breakoutB').expect(201);
      await decide(hall.body.id, 'approve', 'hallStaff').expect(200);
      await decide(a.body.id, 'reject', 'roomStaff', { reason: 'No.' }).expect(200);
      await release(b.body.id).expect(200);

      expect((await arrangement().expect(200)).body).toMatchObject({ arranged: true, activeBookings: 1 });
    });

    it("is refused for another Coordinator's event (404) and other roles (403)", async () => {
      await arrangement('otherCoordinator').expect(404);
      await arrangement('hallStaff').expect(403);
      await arrangement('organiser').expect(403);
    });
  });

  describe('US-53 AC-6: cancel or release one booking without affecting the others', () => {
    it('releases one approved booking, keeps its record, and leaves the others and the event alone', async () => {
      const hall = await book('mainHall').expect(201);
      const a = await book('breakoutA').expect(201);
      await decide(hall.body.id, 'approve', 'hallStaff').expect(200);
      await decide(a.body.id, 'approve', 'roomStaff').expect(200);
      const eventBefore = await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.summit } });
      const hallBefore = await prisma.venueBooking.findUniqueOrThrow({ where: { id: hall.body.id } });

      const res = await release(a.body.id).expect(200);

      expect(res.body).toMatchObject({ id: a.body.id, status: 'RELEASED', venueId: ids.breakoutA });
      expect(res.body.releasedAt).not.toBeNull();
      // The record is kept, with its decision history.
      const kept = await prisma.venueBooking.findUniqueOrThrow({
        where: { id: a.body.id },
        include: { decisions: true },
      });
      expect(kept.decisions).toHaveLength(1);
      // The other booking and the event are untouched.
      expect(await prisma.venueBooking.findUniqueOrThrow({ where: { id: hall.body.id } })).toEqual(hallBefore);
      expect(await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.summit } })).toEqual(eventBefore);
    });

    it('cancels a pending request the same way', async () => {
      const a = await book('breakoutA').expect(201);

      await release(a.body.id).expect(200).expect((res) => expect(res.body.status).toBe('RELEASED'));
    });

    it('frees the slot: the venue can be booked again for that time', async () => {
      const a = await book('breakoutA').expect(201);
      await decide(a.body.id, 'approve', 'roomStaff').expect(200);
      await release(a.body.id).expect(200);

      await book('breakoutA').expect(201);
    });

    it('refuses to release a rejected or already released booking', async () => {
      const a = await book('breakoutA').expect(201);
      const b = await book('breakoutB').expect(201);
      await decide(a.body.id, 'reject', 'roomStaff', { reason: 'No.' }).expect(200);
      await release(b.body.id).expect(200);

      const rejected = await release(a.body.id).expect(409);
      expect(rejected.body.message).toBe('a rejected booking cannot be released');
      await release(b.body.id).expect(409);
    });

    it("another Coordinator cannot release the event's booking (404); other roles get 403", async () => {
      const a = await book('breakoutA').expect(201);

      await release(a.body.id, 'otherCoordinator').expect(404);
      for (const who of ['roomStaff', 'organiser', 'tech']) {
        await release(a.body.id, who).expect(403);
      }
      expect((await prisma.venueBooking.findUniqueOrThrow({ where: { id: a.body.id } })).status).toBe(
        BookingStatus.REQUESTED,
      );
    });

    it('US-52 interplay: a released booking no longer shows as needing a replacement', async () => {
      const a = await book('breakoutA').expect(201);
      await prisma.venueBooking.update({
        where: { id: a.body.id },
        data: { replacementNeededAt: new Date(), unavailableReason: 'Flood' },
      });
      const flagged = () =>
        http().get('/bookings/replacements-needed').set('Authorization', as('coordinator'));
      expect((await flagged().expect(200)).body).toHaveLength(1);

      await release(a.body.id).expect(200);

      await flagged().expect(200).expect([]);
    });

    it("another Coordinator cannot add a booking to the event (404)", async () => {
      await book('breakoutA', {}, 'otherCoordinator').expect(404);
    });
  });
});
