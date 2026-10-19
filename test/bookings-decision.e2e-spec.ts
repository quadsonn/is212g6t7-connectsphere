import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BookingDecisionKind,
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
import { listenOnLoopback } from './listen-on-loopback';

/** US-23 e2e — Approve/Reject Booking Request with Reason. */
describe('US-23 approve/reject a booking request with reason (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const act = (id: string, action: string, body: object = {}, who = 'staff') =>
    http().post(`/bookings/${id}/${action}`).set('Authorization', as(who)).send(body);

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: key, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  const seedBooking = async (startHour = 9, endHour = 12, name = 'Showcase') => {
    const event = await prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        coordinatorId: ids.coordinator,
        name,
        purpose: 'p',
        description: 'd',
        category: 'c',
        proposedStart: new Date('2030-10-01T09:00:00Z'),
        proposedEnd: new Date('2030-10-01T12:00:00Z'),
        expectedAttendance: 80,
        status: EventStatus.APPROVED,
      },
    });
    return prisma.venueBooking.create({
      data: {
        eventId: event.id,
        venueId: ids.venue,
        start: new Date(`2030-10-01T${String(startHour).padStart(2, '0')}:00:00Z`),
        end: new Date(`2030-10-01T${String(endHour).padStart(2, '0')}:00:00Z`),
        expectedAttendance: 80,
        requestedById: ids.coordinator,
      },
    });
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
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.bookingDecision.deleteMany();
    await prisma.venueBooking.deleteMany();
    await prisma.venue.deleteMany();
    await prisma.clarificationMessage.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();

    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('otherOrganiser', 'other.organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);
    await seedUser('staff', 'staff@example.com', Role.VENUE_STAFF);
    await seedUser('otherStaff', 'other.staff@example.com', Role.VENUE_STAFF);

    const venue = await prisma.venue.create({
      data: {
        name: 'Main Hall',
        location: 'Campus',
        capacity: 200,
        facilities: [],
        accessibilityFeatures: [],
        status: VenueStatus.PUBLISHED,
        managedById: ids.staff,
      },
    });
    ids.venue = venue.id;
  });

  describe('AC-1: approve and reject act on a request the staff member manages', () => {
    it('is refused for another staff member\'s venue (404) and for a Coordinator (403)', async () => {
      const booking = await seedBooking();

      expect((await act(booking.id, 'approve', {}, 'otherStaff')).status).toBe(404);
      expect((await act(booking.id, 'approve', {}, 'coordinator')).status).toBe(403);
    });
  });

  describe('AC-2: rejecting requires a reason', () => {
    it('refuses a rejection without a reason, and changes nothing', async () => {
      const booking = await seedBooking();

      const res = await act(booking.id, 'reject', { reason: '' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('a reason is required to reject this booking request');
      expect((await prisma.venueBooking.findUnique({ where: { id: booking.id } }))?.status).toBe(
        BookingStatus.REQUESTED,
      );
    });

    it('rejects with a reason', async () => {
      const booking = await seedBooking();

      const res = await act(booking.id, 'reject', { reason: 'Under maintenance' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'REJECTED', decisionReason: 'Under maintenance' });
    });
  });

  describe('AC-3: approving allows an optional note', () => {
    it('approves with no body at all', async () => {
      const booking = await seedBooking();

      const res = await act(booking.id, 'approve');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('APPROVED');
    });

    it('approves with a note', async () => {
      const booking = await seedBooking();

      const res = await act(booking.id, 'approve', { note: 'Doors open 8am' });

      expect(res.body.decisionReason).toBe('Doors open 8am');
    });
  });

  describe('AC-4: the decision is timestamped and attributed', () => {
    it('returns a decision history entry naming the staff member', async () => {
      const booking = await seedBooking();

      const res = await act(booking.id, 'reject', { reason: 'Too small' });

      expect(res.body.decisions).toEqual([
        expect.objectContaining({
          kind: BookingDecisionKind.DECISION,
          outcome: 'REJECTED',
          reason: 'Too small',
          createdAt: expect.any(String),
          decidedBy: expect.objectContaining({ id: ids.staff, role: Role.VENUE_STAFF }),
        }),
      ]);
    });
  });

  describe('AC-5: the Coordinator and Organiser can see the decision', () => {
    it('shows it to both on GET /bookings/events/:eventId, and notifies both', async () => {
      const booking = await seedBooking();
      await act(booking.id, 'reject', { reason: 'Under maintenance' });

      for (const who of ['coordinator', 'organiser']) {
        const res = await http()
          .get(`/bookings/events/${booking.eventId}`)
          .set('Authorization', as(who));

        expect(res.status).toBe(200);
        expect(res.body[0]).toMatchObject({
          status: 'REJECTED',
          decisionReason: 'Under maintenance',
          decisions: [expect.objectContaining({ reason: 'Under maintenance' })],
        });
      }

      const notified = await prisma.notification.findMany({
        where: { type: NotificationType.VENUE_BOOKING_DECIDED },
      });
      expect(notified.map((n) => n.recipientId).sort()).toEqual(
        [ids.coordinator, ids.organiser].sort(),
      );
    });

    it('hides it from an unrelated Organiser', async () => {
      const booking = await seedBooking();

      const res = await http()
        .get(`/bookings/events/${booking.eventId}`)
        .set('Authorization', as('otherOrganiser'));

      expect(res.body).toEqual([]);
    });
  });

  describe('AC-6: a reversal is a new recorded action', () => {
    it('keeps the original decision and appends the reversal', async () => {
      const booking = await seedBooking();
      await act(booking.id, 'approve', { note: 'OK' });

      const res = await act(booking.id, 'reverse', { reason: 'Venue flooded' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('REJECTED');
      expect(res.body.decisions.map((d: { kind: string; outcome: string; reason: string }) => [d.kind, d.outcome, d.reason]))
        .toEqual([
          ['DECISION', 'APPROVED', 'OK'],
          ['REVERSAL', 'REJECTED', 'Venue flooded'],
        ]);
    });

    it('requires a reason to reverse', async () => {
      const booking = await seedBooking();
      await act(booking.id, 'approve');

      expect((await act(booking.id, 'reverse', {})).status).toBe(400);
    });
  });

  describe('Capacity: an over-capacity request can be rejected but not approved', () => {
    // An existing request over the venue's 200 seats — saved before capacity
    // was enforced on submission. Written directly, as such data would be.
    const overCapacity = async () => {
      const booking = await seedBooking();
      return prisma.venueBooking.update({
        where: { id: booking.id },
        data: { expectedAttendance: 499 },
      });
    };

    it('Backend rejects approval of an over-capacity request (409), even with the page bypassed, and records nothing', async () => {
      const booking = await overCapacity();

      const res = await act(booking.id, 'approve').expect(409);

      expect(res.body).toMatchObject({
        code: 'CAPACITY_EXCEEDED',
        message: expect.stringMatching(
          /^Cannot approve: .+ holds 200, but expected attendance is 499\.$/,
        ),
        capacity: 200,
        expectedAttendance: 499,
      });
      const after = await prisma.venueBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(after.status).toBe(BookingStatus.REQUESTED);
      expect(await prisma.bookingDecision.count({ where: { bookingId: booking.id } })).toBe(0);
    });

    it('Backend rejects a reversal that would approve an over-capacity request', async () => {
      const booking = await overCapacity();
      await act(booking.id, 'reject', { reason: 'Too small' }).expect(200);

      const res = await act(booking.id, 'reverse', { reason: 'Reconsidered' }).expect(409);

      expect(res.body.code).toBe('CAPACITY_EXCEEDED');
      const after = await prisma.venueBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(after.status).toBe(BookingStatus.REJECTED);
    });

    it('Reject still works on an over-capacity request', async () => {
      const booking = await overCapacity();

      const res = await act(booking.id, 'reject', {
        reason: 'Over capacity: 499 attendees, venue holds 200',
      }).expect(200);

      expect(res.body.status).toBe(BookingStatus.REJECTED);
    });

    it.each([
      ['equal to', 200],
      ['below', 80],
    ])('Approval still works when attendance is %s capacity', async (_label, attendance) => {
      const booking = await seedBooking();
      await prisma.venueBooking.update({
        where: { id: booking.id },
        data: { expectedAttendance: attendance },
      });

      const res = await act(booking.id, 'approve').expect(200);

      expect(res.body.status).toBe(BookingStatus.APPROVED);
    });
  });

  describe('AC-7: the same request cannot be decided twice', () => {
    it('refuses a second approve or reject (409) and records nothing more', async () => {
      const booking = await seedBooking();
      await act(booking.id, 'approve');

      expect((await act(booking.id, 'approve')).status).toBe(409);
      expect((await act(booking.id, 'reject', { reason: 'changed my mind' })).status).toBe(409);
      expect(await prisma.bookingDecision.count({ where: { bookingId: booking.id } })).toBe(1);
    });

    it('lets only one of two simultaneous approvals through', async () => {
      const booking = await seedBooking();

      const results = await Promise.all([act(booking.id, 'approve'), act(booking.id, 'approve')]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await prisma.bookingDecision.count({ where: { bookingId: booking.id } })).toBe(1);
    });
  });

  describe('integration with US-21: an approved booking blocks the slot', () => {
    it('refuses to approve a second, overlapping request', async () => {
      const first = await seedBooking(9, 12, 'First');
      const second = await seedBooking(10, 13, 'Second');
      await act(first.id, 'approve');

      const res = await act(second.id, 'approve');

      expect(res.status).toBe(409);
      expect(res.body.conflicts).toEqual([expect.objectContaining({ bookingId: first.id })]);
    });
  });
});
