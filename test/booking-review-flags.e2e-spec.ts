import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BookingDecisionKind,
  BookingStatus,
  EventStatus,
  PrismaClient,
  Role,
  VenueStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { overlapsRange, windowsOverlap } from '../src/bookings/booking-overlap';
import { listenOnLoopback } from './listen-on-loopback';

/** US-51 e2e — flagging bookings that conflict after a buffer change. */
describe('US-51 flag bookings that conflict after buffer changes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const at = (time: string, day = '2030-10-01') => new Date(`${day}T${time}:00Z`);
  const CUSTOMER = { setupMinutes: 30, turnaroundMinutes: 45 };

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: key, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  const seedVenue = async (name = 'Sandbox Auditorium') =>
    prisma.venue.create({
      data: {
        name,
        location: 'School of Computing, Level 1',
        capacity: 420,
        status: VenueStatus.PUBLISHED,
        managedById: ids.staffA,
      },
    });

  const seedBooking = async (
    venueId: string,
    name: string,
    start: Date,
    end: Date,
    status: BookingStatus = BookingStatus.APPROVED,
  ) => {
    const event = await prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        coordinatorId: ids.coordinator,
        name,
        purpose: 'Teaching',
        description: 'A session',
        category: 'Academic',
        proposedStart: start,
        proposedEnd: end,
        expectedAttendance: 50,
        status: EventStatus.PLANNING,
      },
    });
    return prisma.venueBooking.create({
      data: { eventId: event.id, venueId, start, end, status, requestedById: ids.coordinator },
    });
  };

  /** The customer example: 10:00-12:00 and 12:30-14:00, fine until 30/45. */
  const customerPair = async (venueId: string) => ({
    morning: await seedBooking(venueId, 'Morning lecture', at('10:00'), at('12:00')),
    lunch: await seedBooking(venueId, 'Lunch talk', at('12:30'), at('14:00')),
  });

  const preview = (venueId: string, body: object, who = 'staffA') =>
    http().post(`/venues/${venueId}/buffers/preview`).set('Authorization', as(who)).send(body);

  const save = (venueId: string, body: object, who = 'staffA') =>
    http().patch(`/venues/${venueId}/buffers`).set('Authorization', as(who)).send(body);

  const booking = (id: string) => prisma.venueBooking.findUniqueOrThrow({ where: { id } });
  const buffers = (id: string) =>
    prisma.venue.findUniqueOrThrow({
      where: { id },
      select: { setupMinutes: true, turnaroundMinutes: true },
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
    await prisma.bookingDecision.deleteMany();
    await prisma.venueBooking.deleteMany();
    await prisma.venueBlock.deleteMany();
    await prisma.venue.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();

    await seedUser('staffA', 'staff.a@example.com', Role.VENUE_STAFF);
    await seedUser('staffB', 'staff.b@example.com', Role.VENUE_STAFF);
    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);
  });

  describe('AC-1/AC-3: preview lists clashes before saving', () => {
    it('US-51: the customer example — both bookings are listed with what they clash with', async () => {
      const venue = await seedVenue();
      const { morning, lunch } = await customerPair(venue.id);

      const res = await preview(venue.id, CUSTOMER).expect(200);

      expect(res.body.clashes).toEqual([
        {
          bookingId: morning.id,
          eventName: 'Morning lecture',
          start: at('10:00').toISOString(),
          end: at('12:00').toISOString(),
          clashesWith: {
            bookingId: lunch.id,
            eventName: 'Lunch talk',
            start: at('12:30').toISOString(),
            end: at('14:00').toISOString(),
          },
        },
        expect.objectContaining({ bookingId: lunch.id, clashesWith: expect.objectContaining({ bookingId: morning.id }) }),
      ]);
    });

    it('US-51: preview saves nothing', async () => {
      const venue = await seedVenue();
      const { morning } = await customerPair(venue.id);

      await preview(venue.id, CUSTOMER).expect(200);

      expect(await buffers(venue.id)).toEqual({ setupMinutes: 0, turnaroundMinutes: 0 });
      expect((await booking(morning.id)).needsReview).toBe(false);
    });

    it('US-51: with 0/0 buffers the customer example does not clash', async () => {
      const venue = await seedVenue();
      await customerPair(venue.id);

      const res = await preview(venue.id, { setupMinutes: 0, turnaroundMinutes: 0 }).expect(200);

      expect(res.body.clashes).toEqual([]);
    });

    it('US-51: padded windows that only touch do not clash', async () => {
      const venue = await seedVenue();
      await seedBooking(venue.id, 'Morning lecture', at('10:00'), at('12:00'));
      await seedBooking(venue.id, 'Afternoon', at('13:15'), at('14:00'));

      const res = await preview(venue.id, CUSTOMER).expect(200);

      expect(res.body.clashes).toEqual([]);
    });

    it('US-51: preview validates like the save (whole numbers 0-480)', async () => {
      const venue = await seedVenue();

      await preview(venue.id, { setupMinutes: 481, turnaroundMinutes: 0 }).expect(400);
    });
  });

  describe('AC-1/AC-2: what is re-checked', () => {
    it('US-51 AC-2: past bookings are ignored', async () => {
      const venue = await seedVenue();
      await seedBooking(venue.id, 'Old A', at('10:00', '2020-01-01'), at('12:00', '2020-01-01'));
      await seedBooking(venue.id, 'Old B', at('12:30', '2020-01-01'), at('14:00', '2020-01-01'));

      const res = await preview(venue.id, CUSTOMER).expect(200);

      expect(res.body.clashes).toEqual([]);
    });

    it('US-51: REJECTED bookings are ignored', async () => {
      const venue = await seedVenue();
      await seedBooking(venue.id, 'Morning lecture', at('10:00'), at('12:00'));
      await seedBooking(venue.id, 'Rejected talk', at('12:30'), at('14:00'), BookingStatus.REJECTED);

      const res = await preview(venue.id, CUSTOMER).expect(200);

      expect(res.body.clashes).toEqual([]);
    });

    it('US-51: REQUESTED bookings are re-checked as well as APPROVED', async () => {
      const venue = await seedVenue();
      await seedBooking(venue.id, 'Morning lecture', at('10:00'), at('12:00'), BookingStatus.REQUESTED);
      await seedBooking(venue.id, 'Lunch talk', at('12:30'), at('14:00'));

      const res = await preview(venue.id, CUSTOMER).expect(200);

      expect(res.body.clashes).toHaveLength(2);
    });

    it('US-51: bookings on another venue are untouched', async () => {
      const venue = await seedVenue();
      const other = await seedVenue('Other Hall');
      const { morning } = await customerPair(other.id);

      await save(venue.id, { ...CUSTOMER, confirmConflicts: true }).expect(200);

      expect((await booking(morning.id)).needsReview).toBe(false);
    });
  });

  describe('AC-4/AC-5/AC-6: cancel or save anyway', () => {
    it('US-51 AC-4: without confirmation, a clash is a 409 with the list, and nothing is saved', async () => {
      const venue = await seedVenue();
      const { morning, lunch } = await customerPair(venue.id);

      const res = await save(venue.id, CUSTOMER).expect(409);

      expect(res.body.clashes.map((c: { bookingId: string }) => c.bookingId).sort()).toEqual(
        [morning.id, lunch.id].sort(),
      );
      expect(await buffers(venue.id)).toEqual({ setupMinutes: 0, turnaroundMinutes: 0 });
      expect((await booking(morning.id)).needsReview).toBe(false);
    });

    it('US-51 AC-5/AC-6: save anyway — buffers saved, both flagged, times and status unchanged', async () => {
      const venue = await seedVenue();
      const { morning, lunch } = await customerPair(venue.id);

      const res = await save(venue.id, { ...CUSTOMER, confirmConflicts: true }).expect(200);

      expect(res.body).toMatchObject({ ...CUSTOMER, flagged: 2 });
      expect(await buffers(venue.id)).toEqual(CUSTOMER);
      for (const original of [morning, lunch]) {
        const after = await booking(original.id);
        expect(after).toMatchObject({
          needsReview: true,
          start: original.start,
          end: original.end,
          status: original.status,
        });
        expect(after.needsReviewReason).toMatch(/30\/45/);
        expect(after.flaggedAt).toBeInstanceOf(Date);
      }
    });

    it('US-51 AC-7: no clashes — saved, nothing flagged', async () => {
      const venue = await seedVenue();
      const { morning } = await customerPair(venue.id);

      const res = await save(venue.id, { setupMinutes: 10, turnaroundMinutes: 15 }).expect(200);

      expect(res.body).toMatchObject({ setupMinutes: 10, turnaroundMinutes: 15, flagged: 0 });
      expect((await booking(morning.id)).needsReview).toBe(false);
    });

    it('US-51: other Venue Staff cannot preview or save (404)', async () => {
      const venue = await seedVenue();

      await preview(venue.id, CUSTOMER, 'staffB').expect(404);
      await save(venue.id, { ...CUSTOMER, confirmConflicts: true }, 'staffB').expect(404);
    });
  });

  describe('AC-5: the flag shows in the queue and calendar', () => {
    it('US-51: queue and calendar entries carry needsReview', async () => {
      const venue = await seedVenue();
      const { morning } = await customerPair(venue.id);
      await save(venue.id, { ...CUSTOMER, confirmConflicts: true }).expect(200);

      const queue = await http()
        .get('/bookings/queue')
        .query({ view: 'decided', needsReview: 'true' })
        .set('Authorization', as('staffA'))
        .expect(200);
      expect(queue.body).toHaveLength(2);
      expect(queue.body.every((b: { needsReview: boolean }) => b.needsReview)).toBe(true);

      const calendar = await http()
        .get('/calendar')
        .query({ from: at('00:00').toISOString(), to: at('23:59').toISOString() })
        .set('Authorization', as('staffA'))
        .expect(200);
      const entry = calendar.body.entries.find((e: { id: string }) => e.id === morning.id);
      expect(entry).toMatchObject({ kind: 'CONFIRMED', needsReview: true });
      expect(entry.needsReviewReason).toMatch(/Lunch talk/);
    });
  });

  describe('resolution', () => {
    const flaggedPair = async () => {
      const venue = await seedVenue();
      const pair = await customerPair(venue.id);
      await save(venue.id, { ...CUSTOMER, confirmConflicts: true }).expect(200);
      return { venue, ...pair };
    };

    const resolve = (id: string, who = 'staffA', body: object = {}) =>
      http().post(`/bookings/${id}/resolve-review`).set('Authorization', as(who)).send(body);

    it('US-51: manual resolve clears the flag and writes a BookingDecision', async () => {
      const { morning } = await flaggedPair();

      await resolve(morning.id, 'staffA', { note: 'Agreed a shorter setup with both organisers' }).expect(200);

      const after = await booking(morning.id);
      expect(after).toMatchObject({
        needsReview: false,
        reviewResolvedById: ids.staffA,
        status: BookingStatus.APPROVED,
      });
      expect(after.reviewResolvedAt).toBeInstanceOf(Date);
      expect(await prisma.bookingDecision.findMany({ where: { bookingId: morning.id } })).toEqual([
        expect.objectContaining({
          kind: BookingDecisionKind.REVIEW_RESOLVED,
          outcome: BookingStatus.APPROVED,
          decidedById: ids.staffA,
          reason: 'Agreed a shorter setup with both organisers',
        }),
      ]);
    });

    it('US-51: other Venue Staff get 404 and other roles 403; the flag stays', async () => {
      const { morning } = await flaggedPair();

      await resolve(morning.id, 'staffB').expect(404);
      await resolve(morning.id, 'coordinator').expect(403);
      await resolve(morning.id, 'organiser').expect(403);

      expect((await booking(morning.id)).needsReview).toBe(true);
    });

    it('US-51: an unflagged booking cannot be resolved (409)', async () => {
      const venue = await seedVenue();
      const { morning } = await customerPair(venue.id);

      await resolve(morning.id).expect(409);
    });

    it('US-51: auto-clear — rejecting one booking of a clashing pair clears the other\'s flag', async () => {
      const venue = await seedVenue();
      const morning = await seedBooking(venue.id, 'Morning lecture', at('10:00'), at('12:00'), BookingStatus.REQUESTED);
      const lunch = await seedBooking(venue.id, 'Lunch talk', at('12:30'), at('14:00'));
      await save(venue.id, { ...CUSTOMER, confirmConflicts: true }).expect(200);

      await http()
        .post(`/bookings/${morning.id}/reject`)
        .set('Authorization', as('staffA'))
        .send({ reason: 'Clashes with the lunch talk' })
        .expect(200);

      const after = await booking(lunch.id);
      expect(after.needsReview).toBe(false);
      expect(after.reviewResolvedAt).toBeInstanceOf(Date);
      expect(after.reviewResolvedById).toBeNull();
      expect((await booking(morning.id)).needsReview).toBe(false);
    });

    it('US-51: auto-clear — reversing an approval to rejected clears the other\'s flag', async () => {
      const { morning, lunch } = await flaggedPair();

      await http()
        .post(`/bookings/${morning.id}/reverse`)
        .set('Authorization', as('staffA'))
        .send({ reason: 'Moved to another venue' })
        .expect(200);

      expect((await booking(lunch.id)).needsReview).toBe(false);
    });

    it('US-51: auto re-check keeps a flag that still clashes with something else', async () => {
      const venue = await seedVenue();
      const { morning, lunch } = await customerPair(venue.id);
      const late = await seedBooking(venue.id, 'Afternoon seminar', at('14:30'), at('16:00'));
      await save(venue.id, { ...CUSTOMER, confirmConflicts: true }).expect(200);

      await http()
        .post(`/bookings/${morning.id}/reverse`)
        .set('Authorization', as('staffA'))
        .send({ reason: 'Moved' })
        .expect(200);

      // lunch still clashes with the afternoon seminar (14:45 > 14:00).
      expect((await booking(lunch.id)).needsReview).toBe(true);
      expect((await booking(late.id)).needsReview).toBe(true);
    });
  });

  describe('windowsOverlap agrees with the Postgres overlap query', () => {
    it.each([
      ['touching', at('12:00'), at('13:00'), false],
      ['overlapping by a minute', at('11:59'), at('13:00'), true],
      ['disjoint', at('13:00'), at('14:00'), false],
      ['containing', at('09:00'), at('13:00'), true],
    ])('US-51: %s', async (_label, start, end, expected) => {
      const venue = await seedVenue();
      await seedBooking(venue.id, 'Morning lecture', at('10:00'), at('12:00'));

      const inDb = await prisma.venueBooking.count({ where: { venueId: venue.id, ...overlapsRange(start, end) } });

      expect(inDb > 0).toBe(expected);
      expect(windowsOverlap({ start: at('10:00'), end: at('12:00') }, { start, end })).toBe(expected);
    });
  });
});
