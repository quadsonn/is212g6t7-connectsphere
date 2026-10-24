import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus, PrismaClient, Role, VenueStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { dayKeyOf, resolveRange } from '../src/venues/availability';
import { listenOnLoopback } from './listen-on-loopback';

/** US-17 e2e — a Coordinator checking a venue's availability calendar. */
describe('US-17 view a venue availability calendar (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const EVENT_NAME = 'Secret Board Offsite';
  const ORGANISER_NAME = 'Olive Organiser';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const seedUser = async (key: string, email: string, role: Role, name = key) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  const seedVenue = (key: string, status: VenueStatus) =>
    prisma.venue
      .create({
        data: {
          name: `${key} venue`,
          location: 'Somewhere',
          capacity: 100,
          facilities: [],
          accessibilityFeatures: [],
          status,
          managedById: ids.staff,
        },
      })
      .then((venue) => (ids[key] = venue.id));

  /** Times are Singapore local, matching how the calendar buckets days. */
  const seedBooking = (start: string, end: string, status: BookingStatus) =>
    prisma.venueBooking.create({
      data: {
        eventId: ids.event,
        venueId: ids.venue,
        start: new Date(`${start}+08:00`),
        end: new Date(`${end}+08:00`),
        status,
      },
    });

  const BLOCK_REASON = 'Confidential renovation';

  /** A Venue Staff block, Singapore local time. */
  const seedBlock = (start: string, end: string) =>
    prisma.venueBlock.create({
      data: {
        venueId: ids.venue,
        start: new Date(`${start}+08:00`),
        end: new Date(`${end}+08:00`),
        reason: BLOCK_REASON,
        createdById: ids.staff,
      },
    });

  const slots = (who: string, venueId: string, query = '') =>
    http()
      .get(`/venues/${venueId}/availability/slots${query}`)
      .set('Authorization', as(who));

  const availability = (who: string, venueId: string, query = '') =>
    http()
      .get(`/venues/${venueId}/availability${query}`)
      .set('Authorization', as(who));

  const statusOn = (body: { date: string; status: string }[], date: string) =>
    body.find((day) => day.date === date)?.status;

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
    await prisma.revokedToken.deleteMany();
    await prisma.clarificationMessage.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();

    await seedUser('staff', 'staff@example.com', Role.VENUE_STAFF);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);
    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER, ORGANISER_NAME);
    await seedUser('tech', 'tech@example.com', Role.TECHNICAL_SUPPORT_STAFF);
    await seedUser('attendee', 'attendee@example.com', Role.ATTENDEE);

    await seedVenue('venue', VenueStatus.PUBLISHED);
    await seedVenue('draft', VenueStatus.DRAFT);

    const event = await prisma.eventRequest.create({
      data: { organiserId: ids.organiser, name: EVENT_NAME },
    });
    ids.event = event.id;
  });

  describe('AC-1: the calendar covers at least the current and next month', () => {
    it('defaults to every day of the current and next month', async () => {
      const res = await availability('coordinator', ids.venue).expect(200);

      const expected = resolveRange({}, new Date());
      expect(res.body[0].date).toBe(expected.from);
      expect(res.body.at(-1).date).toBe(expected.to);
      expect(res.body.map((d: { date: string }) => d.date)).toContain(
        dayKeyOf(new Date()),
      );
    });

    it('shows existing bookings for that venue', async () => {
      await seedBooking('2027-03-10T09:00:00', '2027-03-10T17:00:00', BookingStatus.APPROVED);

      const res = await availability('coordinator', ids.venue, '?month=2027-03').expect(200);

      expect(statusOn(res.body, '2027-03-10')).toBe('booked');
    });

    it("ignores another venue's bookings", async () => {
      await seedBooking('2027-03-10T09:00:00', '2027-03-10T17:00:00', BookingStatus.APPROVED);
      const other = await seedVenue('other', VenueStatus.PUBLISHED);

      const res = await availability('coordinator', other, '?month=2027-03').expect(200);

      expect(statusOn(res.body, '2027-03-10')).toBe('free');
    });

    it('is not cached', async () => {
      const res = await availability('coordinator', ids.venue).expect(200);

      expect(res.headers['cache-control']).toBe('no-store');
    });
  });

  describe('AC-1: the calendar shows blocked-off periods', () => {
    it('Given a block on a day, Then that day is blocked', async () => {
      await seedBlock('2027-03-15T09:00:00', '2027-03-15T13:00:00');

      const res = await availability('coordinator', ids.venue, '?month=2027-03').expect(200);

      expect(statusOn(res.body, '2027-03-15')).toBe('blocked');
      expect(statusOn(res.body, '2027-03-16')).toBe('free');
    });

    it('Given a block across several days, Then every day it touches is blocked', async () => {
      await seedBlock('2027-03-20T00:00:00', '2027-03-23T00:00:00');

      const res = await availability('coordinator', ids.venue, '?month=2027-03').expect(200);

      expect(['20', '21', '22'].map((d) => statusOn(res.body, `2027-03-${d}`))).toEqual([
        'blocked',
        'blocked',
        'blocked',
      ]);
      expect(statusOn(res.body, '2027-03-23')).toBe('free');
    });

    it('Given a block and an approved booking on the same day, Then the day is blocked', async () => {
      await seedBooking('2027-03-15T14:00:00', '2027-03-15T17:00:00', BookingStatus.APPROVED);
      await seedBlock('2027-03-15T09:00:00', '2027-03-15T12:00:00');

      const res = await availability('coordinator', ids.venue, '?month=2027-03').expect(200);

      expect(statusOn(res.body, '2027-03-15')).toBe('blocked');
    });

    it("ignores another venue's blocks", async () => {
      await prisma.venueBlock.create({
        data: {
          venueId: ids.draft,
          start: new Date('2027-03-15T09:00:00+08:00'),
          end: new Date('2027-03-15T13:00:00+08:00'),
          reason: BLOCK_REASON,
          createdById: ids.staff,
        },
      });

      const res = await availability('coordinator', ids.venue, '?month=2027-03').expect(200);

      expect(statusOn(res.body, '2027-03-15')).toBe('free');
    });

    it('never reveals why the period is blocked or who blocked it', async () => {
      const block = await seedBlock('2027-03-15T09:00:00', '2027-03-15T13:00:00');

      const days = await availability('coordinator', ids.venue, '?month=2027-03').expect(200);
      const times = await slots('coordinator', ids.venue, '?from=2027-03-15&to=2027-03-15').expect(200);

      for (const raw of [JSON.stringify(days.body), JSON.stringify(times.body)]) {
        for (const secret of [BLOCK_REASON, block.id, ids.staff]) {
          expect(raw).not.toContain(secret);
        }
      }
    });

    it('Given a block, Then the day\'s times list it as a blocked period', async () => {
      await seedBlock('2027-03-15T09:00:00', '2027-03-15T13:00:00');

      const res = await slots('coordinator', ids.venue, '?from=2027-03-15&to=2027-03-15').expect(200);

      expect(res.body).toEqual([
        {
          status: 'blocked',
          segments: [
            {
              kind: 'BLOCKED',
              start: new Date('2027-03-15T09:00:00+08:00').toISOString(),
              end: new Date('2027-03-15T13:00:00+08:00').toISOString(),
            },
          ],
        },
      ]);
    });

    it('lists bookings and blocks together, earliest first', async () => {
      await seedBooking('2027-03-15T14:00:00', '2027-03-15T17:00:00', BookingStatus.APPROVED);
      await seedBlock('2027-03-15T09:00:00', '2027-03-15T12:00:00');

      const res = await slots('coordinator', ids.venue, '?from=2027-03-15&to=2027-03-15').expect(200);

      expect(res.body.map((entry: { status: string }) => entry.status)).toEqual(['blocked', 'booked']);
    });
  });

  describe('AC-2: each month loads on its own, within two seconds', () => {
    it('returns exactly the requested future month', async () => {
      const started = Date.now();
      const res = await availability('coordinator', ids.venue, '?month=2027-02').expect(200);

      expect(Date.now() - started).toBeLessThan(2000);
      expect(res.body).toHaveLength(28);
      expect(res.body[0].date).toBe('2027-02-01');
      expect(res.body.at(-1).date).toBe('2027-02-28');
    });

    it('rejects a malformed month', async () => {
      await availability('coordinator', ids.venue, '?month=2027-13').expect(400);
    });

    it('rejects a range longer than two months', async () => {
      await availability('coordinator', ids.venue, '?from=2027-01-01&to=2027-04-01').expect(400);
    });
  });

  describe('AC-3: booked days are distinguished without identifying the booking', () => {
    beforeEach(async () => {
      await seedBooking('2027-03-10T09:00:00', '2027-03-10T17:00:00', BookingStatus.APPROVED);
      await seedBooking('2027-03-12T09:00:00', '2027-03-12T17:00:00', BookingStatus.REQUESTED);
    });

    it('returns only date and status for every day', async () => {
      const res = await availability('coordinator', ids.venue, '?month=2027-03').expect(200);

      for (const day of res.body) {
        expect(Object.keys(day).sort()).toEqual(['date', 'status']);
      }
    });

    it('never mentions the event, its id, or its organiser', async () => {
      const res = await availability('coordinator', ids.venue, '?month=2027-03').expect(200);
      const raw = JSON.stringify(res.body);

      for (const secret of [ids.event, EVENT_NAME, ORGANISER_NAME, ids.organiser]) {
        expect(raw).not.toContain(secret);
      }
    });

    it('marks an approved day as booked', async () => {
      const res = await availability('coordinator', ids.venue, '?month=2027-03').expect(200);

      expect(statusOn(res.body, '2027-03-10')).toBe('booked');
      expect(statusOn(res.body, '2027-03-11')).toBe('free');
    });
  });

  describe('AC-4: pending-only days are tentative', () => {
    it('marks a day with only a pending request as tentative', async () => {
      await seedBooking('2027-03-12T09:00:00', '2027-03-12T17:00:00', BookingStatus.REQUESTED);

      const res = await availability('coordinator', ids.venue, '?month=2027-03').expect(200);

      expect(statusOn(res.body, '2027-03-12')).toBe('tentative');
    });

    it('treats a rejected request as free', async () => {
      await seedBooking('2027-03-12T09:00:00', '2027-03-12T17:00:00', BookingStatus.REJECTED);

      const res = await availability('coordinator', ids.venue, '?month=2027-03').expect(200);

      expect(statusOn(res.body, '2027-03-12')).toBe('free');
    });
  });

  describe('access: Coordinators only, published venues only', () => {
    it.each(['staff', 'organiser', 'tech', 'attendee'])('refuses %s with 403', async (who) => {
      await availability(who, ids.venue).expect(403);
    });

    it('refuses an unauthenticated caller', async () => {
      await http().get(`/venues/${ids.venue}/availability`).expect(401);
    });

    it('reports a draft venue as not found', async () => {
      await availability('coordinator', ids.draft).expect(404);
    });

    it('reports an unknown venue as not found', async () => {
      await availability('coordinator', 'does-not-exist').expect(404);
    });
  });
});
