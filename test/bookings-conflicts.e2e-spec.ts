import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus, EventStatus, PrismaClient, Role, VenueStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { listenOnLoopback } from './listen-on-loopback';

/** US-24 e2e — Overlapping Booking Detection (Venue Staff). */
describe('US-24 overlapping booking detection (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const conflicts = (id: string, who = 'staff') =>
    http().get(`/bookings/${id}/conflicts`).set('Authorization', as(who));
  const approve = (id: string, who = 'staff') =>
    http().post(`/bookings/${id}/approve`).set('Authorization', as(who)).send({});

  /** "HH:MM" on 1 Oct 2030, UTC. */
  const t = (hhmm: string) => new Date(`2030-10-01T${hhmm}:00Z`);

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: key, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  const seedBooking = async (
    name: string,
    from: string,
    to: string,
    status: BookingStatus = BookingStatus.REQUESTED,
  ) => {
    const event = await prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        coordinatorId: ids.coordinator,
        name,
        purpose: 'p',
        description: 'd',
        category: 'c',
        proposedStart: t(from),
        proposedEnd: t(to),
        expectedAttendance: 80,
        status: EventStatus.APPROVED,
      },
    });
    const booking = await prisma.venueBooking.create({
      data: {
        eventId: event.id,
        venueId: ids.venue,
        start: t(from),
        end: t(to),
        status,
        expectedAttendance: 80,
        requestedById: ids.coordinator,
      },
    });
    ids[name] = booking.id;
    return booking;
  };

  const statusOf = async (id: string) =>
    (await prisma.venueBooking.findUniqueOrThrow({ where: { id } })).status;

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
    await prisma.venueBlock.deleteMany();
    await prisma.venue.deleteMany();
    await prisma.clarificationMessage.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();

    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);
    await seedUser('staff', 'staff@example.com', Role.VENUE_STAFF);
    await seedUser('otherStaff', 'other.staff@example.com', Role.VENUE_STAFF);

    const venue = await prisma.venue.create({
      data: {
        name: 'Main Hall',
        location: 'Campus',
        capacity: 200,
        status: VenueStatus.PUBLISHED,
        managedById: ids.staff,
      },
    });
    ids.venue = venue.id;
  });

  describe('AC-1/AC-4: the check runs against every booking on the venue, naming each conflict', () => {
    // One APPROVED neighbour per case: neighbours that overlapped each other
    // would themselves be refused by the EXCLUDE constraint.
    it.each([
      ['ends exactly when it starts', '07:00', '09:00', false],
      ['starts exactly when it ends', '12:00', '14:00', false],
      ['overlaps by one minute', '11:59', '13:00', true],
      ['is fully contained by it', '10:00', '11:00', true],
      ['fully contains it', '08:00', '13:00', true],
    ])('US-24: a confirmed booking that %s conflicts: %s–%s → %s', async (_label, from, to, expected) => {
      const target = await seedBooking('target', '09:00', '12:00');
      await seedBooking('neighbour', from, to, BookingStatus.APPROVED);

      const res = await conflicts(target.id).expect(200);

      expect(res.body.hasHardConflict).toBe(expected);
      expect(res.body.hardConflicts).toHaveLength(expected ? 1 : 0);
    });

    it('US-24: shows event name and time range for each conflict', async () => {
      const target = await seedBooking('target', '09:00', '12:00');
      await seedBooking('Gala', '10:00', '11:00', BookingStatus.APPROVED);

      const res = await conflicts(target.id).expect(200);

      expect(res.body.hardConflicts).toEqual([
        {
          bookingId: ids.Gala,
          eventName: 'Gala',
          start: t('10:00').toISOString(),
          end: t('11:00').toISOString(),
        },
      ]);
    });

    it('US-24 AC-2/AC-3: hard and soft are separate; REJECTED and the booking itself are ignored', async () => {
      const target = await seedBooking('target', '09:00', '12:00');
      await seedBooking('confirmed', '09:30', '10:00', BookingStatus.APPROVED);
      await seedBooking('pending', '10:30', '11:00', BookingStatus.REQUESTED);
      await seedBooking('turnedDown', '09:00', '12:00', BookingStatus.REJECTED);

      const res = await conflicts(target.id).expect(200);

      expect(res.body.hardConflicts.map((c: { eventName: string }) => c.eventName)).toEqual(['confirmed']);
      expect(res.body.softConflicts.map((c: { eventName: string }) => c.eventName)).toEqual(['pending']);
      expect(JSON.stringify(res.body)).not.toContain(ids.target);
      expect(JSON.stringify(res.body)).not.toContain(ids.turnedDown);
    });

    it('US-24: lists a blocked-out period (US-16) as a hard conflict', async () => {
      const target = await seedBooking('target', '09:00', '12:00');
      await prisma.venueBlock.create({
        data: { venueId: ids.venue, start: t('11:00'), end: t('15:00'), reason: 'Maintenance', createdById: ids.staff },
      });

      const res = await conflicts(target.id).expect(200);

      expect(res.body.blocks).toEqual([
        expect.objectContaining({ reason: 'Maintenance', start: t('11:00').toISOString() }),
      ]);
      expect(res.body.hasHardConflict).toBe(true);
    });

    it('US-24: reports nothing for a free slot', async () => {
      const target = await seedBooking('target', '09:00', '12:00');

      const res = await conflicts(target.id).expect(200);

      expect(res.body).toEqual({ hardConflicts: [], softConflicts: [], blocks: [], hasHardConflict: false });
    });
  });

  describe('scope: only the venue’s own Venue Staff', () => {
    it('US-24: another Venue Staff member cannot see or check this booking (404)', async () => {
      const target = await seedBooking('target', '09:00', '12:00');

      await conflicts(target.id, 'otherStaff').expect(404);
    });

    it('US-24: a Coordinator cannot use the Venue Staff check (403)', async () => {
      const target = await seedBooking('target', '09:00', '12:00');

      await conflicts(target.id, 'coordinator').expect(403);
    });
  });

  describe('AC-5/AC-7: approval re-checks at the moment of approval', () => {
    it('US-24: approving over an APPROVED overlap is refused with 409 and leaves the request pending', async () => {
      const target = await seedBooking('target', '09:00', '12:00');
      await seedBooking('confirmed', '11:00', '13:00', BookingStatus.APPROVED);

      const res = await approve(target.id).expect(409);

      expect(res.body.code).toBe('BOOKING_HARD_CONFLICT');
      expect(res.body.report.hardConflicts.map((c: { eventName: string }) => c.eventName)).toEqual(['confirmed']);
      expect(await statusOf(target.id)).toBe(BookingStatus.REQUESTED);
      expect(await prisma.bookingDecision.count({ where: { bookingId: target.id } })).toBe(0);
    });

    it('US-24: approving with only a pending overlap succeeds, with a warning', async () => {
      const target = await seedBooking('target', '09:00', '12:00');
      await seedBooking('pending', '11:00', '13:00');

      const res = await approve(target.id).expect(200);

      expect(res.body.status).toBe(BookingStatus.APPROVED);
      expect(res.body.warnings).toEqual([
        expect.objectContaining({
          code: 'OVERLAPS_PENDING_REQUEST',
          conflicts: [expect.objectContaining({ bookingId: ids.pending, eventName: 'pending' })],
        }),
      ]);
    });

    it('US-24 AC-7: a conflict that appears after the page loaded is still caught', async () => {
      const target = await seedBooking('target', '09:00', '12:00');
      const pending = await seedBooking('pending', '11:00', '13:00');

      // The screen loads: only a soft conflict.
      expect((await conflicts(target.id).expect(200)).body.hasHardConflict).toBe(false);

      // Meanwhile the other request is approved...
      await approve(pending.id).expect(200);

      // ...so approving now is refused, though the page said it was fine.
      await approve(target.id).expect(409);
      expect(await statusOf(target.id)).toBe(BookingStatus.REQUESTED);
    });
  });

  describe('concurrency', () => {
    it('US-24: two simultaneous approvals of overlapping requests — exactly one wins, the other gets 409', async () => {
      const a = await seedBooking('a', '09:00', '12:00');
      const b = await seedBooking('b', '10:00', '13:00');

      const results = await Promise.all([approve(a.id), approve(b.id)]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await prisma.venueBooking.count({ where: { status: BookingStatus.APPROVED } })).toBe(1);
    });

    it('US-24: the database itself refuses a second overlapping APPROVED booking (EXCLUDE, 23P01)', async () => {
      // Bypasses the service and its lock entirely, so this proves the constraint.
      await seedBooking('first', '09:00', '12:00', BookingStatus.APPROVED);
      const second = await seedBooking('second', '11:00', '13:00');

      const error = await prisma.venueBooking
        .update({ where: { id: second.id }, data: { status: BookingStatus.APPROVED } })
        .catch((e: Error) => e);

      expect(String(error)).toMatch(/23P01|VenueBooking_no_overlapping_approved/);
      expect(await statusOf(second.id)).toBe(BookingStatus.REQUESTED);
    });

    it('US-24: the constraint still allows back-to-back APPROVED bookings and overlapping pending ones', async () => {
      await seedBooking('morning', '09:00', '12:00', BookingStatus.APPROVED);
      await seedBooking('afternoon', '12:00', '15:00', BookingStatus.APPROVED);
      await seedBooking('pendingA', '10:00', '11:00');
      await seedBooking('pendingB', '10:00', '11:00');

      expect(await prisma.venueBooking.count()).toBe(4);
    });
  });
});
