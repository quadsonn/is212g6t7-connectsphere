import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BookingStatus,
  EventStatus,
  PrismaClient,
  Role,
  VenueStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';

const DAY = 24 * 60 * 60 * 1000;

/** US-22 e2e — Venue Booking Request Queue. */
describe('US-22 venue booking request queue (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const queue = (query: Record<string, string> = {}, who = 'staff') =>
    http().get('/bookings/queue').query(query).set('Authorization', as(who));

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: key, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  const seedVenue = (name: string, managedById: string) =>
    prisma.venue.create({
      data: {
        name,
        location: 'Campus',
        capacity: 200,
        facilities: [],
        accessibilityFeatures: [],
        status: VenueStatus.PUBLISHED,
        managedById,
      },
    });

  /** A booking on `venueId` starting `daysAhead` days from now. */
  const seedBooking = async (
    venueId: string,
    daysAhead: number,
    name: string,
    status: BookingStatus = BookingStatus.REQUESTED,
    createdAt?: Date,
  ) => {
    const start = new Date(Date.now() + daysAhead * DAY);
    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
    const event = await prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        coordinatorId: ids.coordinator,
        name,
        purpose: 'p',
        description: 'd',
        category: 'c',
        proposedStart: start,
        proposedEnd: end,
        expectedAttendance: 80,
        status: EventStatus.APPROVED,
      },
    });
    return prisma.venueBooking.create({
      data: {
        eventId: event.id,
        venueId,
        start,
        end,
        status,
        expectedAttendance: 80,
        requestedById: ids.coordinator,
        ...(createdAt ? { createdAt } : {}),
      },
    });
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
    await seedUser('staff', 'staff@example.com', Role.VENUE_STAFF);
    await seedUser('otherStaff', 'other.staff@example.com', Role.VENUE_STAFF);

    ids.hall = (await seedVenue('Main Hall', ids.staff)).id;
    ids.room = (await seedVenue('Seminar Room', ids.staff)).id;
    ids.foreign = (await seedVenue('Other Venue', ids.otherStaff)).id;
  });

  const names = (body: { event: { name: string } }[]) => body.map((e) => e.event.name);

  describe('AC-1: only pending requests for venues I manage', () => {
    it('excludes other staff\'s venues and decided requests', async () => {
      await seedBooking(ids.hall, 20, 'Mine pending');
      await seedBooking(ids.hall, 21, 'Mine approved', BookingStatus.APPROVED);
      await seedBooking(ids.foreign, 20, 'Not mine');

      const res = await queue();

      expect(res.status).toBe(200);
      expect(names(res.body)).toEqual(['Mine pending']);
    });

    it('is denied to a Coordinator (403)', async () => {
      expect((await queue({}, 'coordinator')).status).toBe(403);
    });
  });

  describe('AC-2: each entry shows what is needed to review it', () => {
    it('carries event, venue, times, attendance, requester and organiser', async () => {
      await seedBooking(ids.hall, 20, 'Showcase');

      const [entry] = (await queue()).body;

      expect(entry).toMatchObject({
        start: expect.any(String),
        end: expect.any(String),
        expectedAttendance: 80,
        venue: { name: 'Main Hall' },
        event: { name: 'Showcase', organiser: { id: ids.organiser } },
        requestedBy: { id: ids.coordinator },
      });
    });
  });

  describe('AC-3: sorting', () => {
    it('sorts by event date, soonest first, by default', async () => {
      await seedBooking(ids.hall, 30, 'Later');
      await seedBooking(ids.hall, 15, 'Sooner');

      expect(names((await queue()).body)).toEqual(['Sooner', 'Later']);
    });

    it('sorts by submission date when asked', async () => {
      await seedBooking(ids.hall, 15, 'Submitted first', undefined, new Date(Date.now() - 2 * DAY));
      await seedBooking(ids.hall, 30, 'Submitted second', undefined, new Date(Date.now() - DAY));

      const res = await queue({ sortBy: 'submitted', sortOrder: 'desc' });

      expect(names(res.body)).toEqual(['Submitted second', 'Submitted first']);
    });

    // Story 21 (US-22 in code), AC-3. Latest event first, the reverse of the default.
    it('sorts by event date, latest first, when asked', async () => {
      await seedBooking(ids.hall, 15, 'Sooner');
      await seedBooking(ids.hall, 30, 'Later');

      const res = await queue({ sortBy: 'eventDate', sortOrder: 'desc' });

      expect(names(res.body)).toEqual(['Later', 'Sooner']);
    });

    it('rejects an unknown sort field (400)', async () => {
      expect((await queue({ sortBy: 'banana' })).status).toBe(400);
    });
  });

  describe('AC-4: filtering', () => {
    it('filters by venue', async () => {
      await seedBooking(ids.hall, 20, 'In hall');
      await seedBooking(ids.room, 20, 'In room');

      expect(names((await queue({ venueId: ids.room })).body)).toEqual(['In room']);
    });

    it('filters by date range', async () => {
      await seedBooking(ids.hall, 10, 'Inside');
      await seedBooking(ids.hall, 40, 'Outside');

      const res = await queue({
        from: new Date(Date.now() + 5 * DAY).toISOString(),
        to: new Date(Date.now() + 15 * DAY).toISOString(),
      });

      expect(names(res.body)).toEqual(['Inside']);
    });

    it('filters the decided view by status', async () => {
      await seedBooking(ids.hall, 20, 'Approved one', BookingStatus.APPROVED);
      await seedBooking(ids.hall, 20, 'Rejected one', BookingStatus.REJECTED);

      const res = await queue({ view: 'decided', status: 'REJECTED' });

      expect(names(res.body)).toEqual(['Rejected one']);
    });
  });

  describe('AC-5: requests nearing their event date are flagged and prioritised', () => {
    it('puts a request under a week away at the top, flagged', async () => {
      await seedBooking(ids.hall, 30, 'Far', undefined, new Date(Date.now() - 2 * DAY));
      await seedBooking(ids.hall, 3, 'Near', undefined, new Date(Date.now() - DAY));

      const res = await queue({ sortBy: 'submitted', sortOrder: 'asc' });

      expect(res.body.map((e: { event: { name: string }; urgent: boolean }) => [e.event.name, e.urgent]))
        .toEqual([
          ['Near', true],
          ['Far', false],
        ]);
    });
  });

  // Story 21 (US-22 in code), AC-5. An event that has already started with no
  // decision is the most overdue case — it must be flagged, not dropped.
  describe('AC-5: an undecided request whose event has started', () => {
    it('is still flagged urgent, with a negative day count', async () => {
      await seedBooking(ids.hall, -1, 'Overdue');

      const [entry] = (await queue()).body;

      expect(entry).toMatchObject({ urgent: true, event: { name: 'Overdue' } });
      expect(entry.daysUntilStart).toBeLessThan(0);
    });
  });

  describe('AC-6: an entry opens the full request detail', () => {
    it('GET /bookings/:id returns it with its requirements', async () => {
      const booking = await seedBooking(ids.hall, 20, 'Showcase');

      const res = await http()
        .get(`/bookings/${booking.id}`)
        .set('Authorization', as('staff'));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessibilityRequirements');
      expect(res.body).toHaveProperty('equipmentNeeds');
      expect(res.body).toHaveProperty('preferredLayout');
    });
  });

  describe('AC-7: decided requests move to the decided view', () => {
    // Story 21 (US-22 in code), AC-7, through the real flow: the test below
    // seeds decided rows directly; this one approves and rejects via the API.
    it('moves a request out of Pending as soon as it is approved or rejected', async () => {
      const approved = await seedBooking(ids.hall, 20, 'Will approve');
      const rejected = await seedBooking(ids.room, 20, 'Will reject');
      expect(names((await queue()).body).sort()).toEqual(['Will approve', 'Will reject']);

      await http().post(`/bookings/${approved.id}/approve`).set('Authorization', as('staff')).send({});
      await http()
        .post(`/bookings/${rejected.id}/reject`)
        .set('Authorization', as('staff'))
        .send({ reason: 'Room under renovation' });

      expect((await queue()).body).toEqual([]);
      expect(names((await queue({ view: 'decided' })).body).sort()).toEqual([
        'Will approve',
        'Will reject',
      ]);
    });

    it('shows approved and rejected requests only under view=decided', async () => {
      await seedBooking(ids.hall, 20, 'Pending one');
      await seedBooking(ids.hall, 20, 'Approved one', BookingStatus.APPROVED);
      await seedBooking(ids.hall, 21, 'Rejected one', BookingStatus.REJECTED);

      expect(names((await queue()).body)).toEqual(['Pending one']);
      expect(names((await queue({ view: 'decided' })).body).sort()).toEqual([
        'Approved one',
        'Rejected one',
      ]);
    });
  });
});
