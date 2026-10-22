import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus, EventStatus, PrismaClient, Role, VenueStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { overlapsRange, paddedRange } from '../src/bookings/booking-overlap';
import { listenOnLoopback } from './listen-on-loopback';

/** US-49 e2e — configuring a venue's setup and turnaround time. */
describe('US-49 venue setup and turnaround time (e2e)', () => {
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

  // No buffer fields: the defaults are what is under test.
  const seedVenue = async (overrides: Record<string, unknown> = {}) =>
    prisma.venue.create({
      data: {
        name: 'Sandbox Auditorium',
        location: 'School of Computing, Level 1',
        capacity: 420,
        status: VenueStatus.PUBLISHED,
        managedById: ids.staffA,
        ...overrides,
      },
    });

  const patchBuffers = (id: string, body: unknown, who = 'staffA') =>
    http().patch(`/venues/${id}/buffers`).set('Authorization', as(who)).send(body as object);

  const stored = async (id: string) =>
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
    await prisma.venueBooking.deleteMany();
    await prisma.venue.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();

    await seedUser('staffA', 'staff.a@example.com', Role.VENUE_STAFF);
    await seedUser('staffB', 'staff.b@example.com', Role.VENUE_STAFF);
    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);
    await seedUser('attendee', 'attendee@example.com', Role.ATTENDEE);
  });

  describe('AC-2: existing venues default to 0', () => {
    it('US-49: a venue saved without buffers has 0 setup and 0 turnaround', async () => {
      const venue = await seedVenue();

      expect(await stored(venue.id)).toEqual({ setupMinutes: 0, turnaroundMinutes: 0 });
    });
  });

  describe('AC-1/AC-5: editable, and shown on the details page', () => {
    it.each([0, 30, 480])('US-49: accepts %p minutes and saves it', async (minutes) => {
      const venue = await seedVenue();

      const res = await patchBuffers(venue.id, {
        setupMinutes: minutes,
        turnaroundMinutes: minutes,
      }).expect(200);

      expect(res.body).toMatchObject({ setupMinutes: minutes, turnaroundMinutes: minutes });
      expect(await stored(venue.id)).toEqual({ setupMinutes: minutes, turnaroundMinutes: minutes });
    });

    it('US-49: the venue detail response includes the saved values', async () => {
      const venue = await seedVenue();
      await patchBuffers(venue.id, { setupMinutes: 30, turnaroundMinutes: 45 }).expect(200);

      for (const who of ['staffA', 'coordinator']) {
        const res = await http()
          .get(`/venues/${venue.id}`)
          .set('Authorization', as(who))
          .expect(200);

        expect(res.body).toMatchObject({ setupMinutes: 30, turnaroundMinutes: 45 });
      }
    });

    it('US-49: a draft venue can be configured too', async () => {
      const venue = await seedVenue({ status: VenueStatus.DRAFT });

      await patchBuffers(venue.id, { setupMinutes: 15, turnaroundMinutes: 20 }).expect(200);

      expect(await stored(venue.id)).toEqual({ setupMinutes: 15, turnaroundMinutes: 20 });
    });

    it('US-49: the general venue edit does not change buffers (one write path)', async () => {
      const venue = await seedVenue();

      await http()
        .patch(`/venues/${venue.id}`)
        .set('Authorization', as('staffA'))
        .send({ setupMinutes: 30, turnaroundMinutes: 45 })
        .expect(200);

      expect(await stored(venue.id)).toEqual({ setupMinutes: 0, turnaroundMinutes: 0 });
    });
  });

  describe('AC-3: only whole numbers 0-480', () => {
    it.each([
      ['-1', { setupMinutes: -1, turnaroundMinutes: 30 }],
      ['481', { setupMinutes: 30, turnaroundMinutes: 481 }],
      ['1.5', { setupMinutes: 1.5, turnaroundMinutes: 30 }],
      ['"abc"', { setupMinutes: 'abc', turnaroundMinutes: 30 }],
      ['a missing setup value', { turnaroundMinutes: 30 }],
      ['a missing turnaround value', { setupMinutes: 30 }],
      ['an empty body', {}],
    ])('US-49: rejects %s with 400 and saves nothing', async (_label, body) => {
      const venue = await seedVenue({ setupMinutes: 10, turnaroundMinutes: 10 });

      const res = await patchBuffers(venue.id, body).expect(400);

      expect(Array.isArray(res.body.message)).toBe(true);
      expect(await stored(venue.id)).toEqual({ setupMinutes: 10, turnaroundMinutes: 10 });
    });
  });

  describe('AC-4: only the managing Venue Staff can edit', () => {
    it('US-49: other Venue Staff get 404 (not 403, so the venue is not confirmed to exist) and nothing is saved', async () => {
      const venue = await seedVenue();

      await patchBuffers(venue.id, { setupMinutes: 30, turnaroundMinutes: 45 }, 'staffB').expect(404);

      expect(await stored(venue.id)).toEqual({ setupMinutes: 0, turnaroundMinutes: 0 });
    });

    it.each(['organiser', 'coordinator', 'attendee'])(
      'US-49: %s gets 403 and nothing is saved',
      async (who) => {
        const venue = await seedVenue();

        await patchBuffers(venue.id, { setupMinutes: 30, turnaroundMinutes: 45 }, who).expect(403);

        expect(await stored(venue.id)).toEqual({ setupMinutes: 0, turnaroundMinutes: 0 });
      },
    );

    it('US-49: an unauthenticated request gets 401', async () => {
      const venue = await seedVenue();

      await http()
        .patch(`/venues/${venue.id}/buffers`)
        .send({ setupMinutes: 30, turnaroundMinutes: 45 })
        .expect(401);
    });
  });

  /**
   * paddedRange composed with the one shared overlap rule, run as a real
   * Postgres query. A booking row is stored with an already-padded window
   * purely to exercise the rule; applying buffers to real bookings is US-50.
   */
  describe('paddedRange with the shared half-open overlap rule', () => {
    const at = (time: string) => new Date(`2030-10-01T${time}:00Z`);

    const storePadded = async (venueId: string, window: { start: Date; end: Date }) => {
      const event = await prisma.eventRequest.create({
        data: {
          organiserId: ids.organiser,
          name: 'Seminar',
          purpose: 'Teaching',
          description: 'A seminar',
          category: 'Academic',
          proposedStart: window.start,
          proposedEnd: window.end,
          expectedAttendance: 50,
          status: EventStatus.APPROVED,
        },
      });
      await prisma.venueBooking.create({
        data: { eventId: event.id, venueId, ...window, status: BookingStatus.APPROVED },
      });
    };

    const overlapsPadded = async (venueId: string, window: { start: Date; end: Date }) =>
      prisma.venueBooking.count({ where: { venueId, ...overlapsRange(window.start, window.end) } });

    it('US-49: two padded windows that only touch at a boundary do not overlap', async () => {
      const venue = await seedVenue();
      // 10:00-12:00 padded 30/45 -> 09:30-12:45.
      await storePadded(venue.id, paddedRange(at('10:00'), at('12:00'), 30, 45));

      // 13:15-14:00 padded 30/45 -> 12:45-14:45: touches at 12:45.
      expect(await overlapsPadded(venue.id, paddedRange(at('13:15'), at('14:00'), 30, 45))).toBe(0);
    });

    it('US-49: padded windows that share even a minute do overlap', async () => {
      const venue = await seedVenue();
      await storePadded(venue.id, paddedRange(at('10:00'), at('12:00'), 30, 45));

      // 13:14 start padded by 30 -> 12:44, one minute inside 09:30-12:45.
      expect(await overlapsPadded(venue.id, paddedRange(at('13:14'), at('14:00'), 30, 45))).toBe(1);
    });
  });
});
