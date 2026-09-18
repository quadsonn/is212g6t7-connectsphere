import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, Role, VenueStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';

/** US-15 e2e — browsing the venue catalogue. */
describe('US-15 browse the venue catalogue (e2e)', () => {
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

  const seedVenue = (overrides: Record<string, unknown>) =>
    prisma.venue.create({
      data: {
        name: 'A venue',
        location: 'Somewhere',
        capacity: 100,
        facilities: ['Stage'],
        accessibilityFeatures: ['Step-free access'],
        supportedLayouts: ['THEATRE'],
        operatingInfo: 'Mon-Fri, 08:00-22:00',
        status: VenueStatus.PUBLISHED,
        managedById: ids.staffA,
        ...overrides,
      },
    });

  const browse = (who: string, query = '') =>
    http().get(`/venues${query}`).set('Authorization', as(who));

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
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();

    await seedUser('staffA', 'staff.a@example.com', Role.VENUE_STAFF);
    await seedUser('staffB', 'staff.b@example.com', Role.VENUE_STAFF);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);
    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('attendee', 'attendee@example.com', Role.ATTENDEE);

    await seedVenue({ name: 'Sandbox Auditorium', location: 'Computing, Level 1', capacity: 420 });
    await seedVenue({ name: 'Seminar Room 3-4', location: 'Admin, Level 3', capacity: 60 });
    await seedVenue({ name: 'Campus Green', location: 'Outdoor', capacity: 800 });
  });

  describe('AC-1: the catalogue lists venues with key details', () => {
    it('returns every published venue', async () => {
      const res = await browse('coordinator').expect(200);

      expect(res.body).toHaveLength(3);
    });

    it('includes name, location and capacity at a glance', async () => {
      const res = await browse('coordinator').expect(200);

      for (const venue of res.body) {
        expect(venue).toMatchObject({
          name: expect.any(String),
          location: expect.any(String),
          capacity: expect.any(Number),
        });
      }
    });

    it('is available to Venue Staff and Coordinators', async () => {
      for (const who of ['staffA', 'coordinator']) {
        await browse(who).expect(200);
      }
    });

    it('gives an Attendee no access to the catalogue', async () => {
      await browse('attendee').expect(403);
    });

    it('refuses an unauthenticated caller', async () => {
      await http().get('/venues').expect(401);
    });
  });

  describe('AC-2: full detail on one venue', () => {
    it('returns facilities, accessibility, layouts and operating hours', async () => {
      const list = await browse('coordinator').expect(200);
      const target = list.body.find((v: { name: string }) => v.name === 'Sandbox Auditorium');

      const res = await http()
        .get(`/venues/${target.id}`)
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(res.body).toMatchObject({
        name: 'Sandbox Auditorium',
        facilities: ['Stage'],
        accessibilityFeatures: ['Step-free access'],
        supportedLayouts: ['THEATRE'],
        operatingInfo: 'Mon-Fri, 08:00-22:00',
      });
    });

    it('reports an unknown venue as not found', async () => {
      await http()
        .get('/venues/does-not-exist')
        .set('Authorization', as('coordinator'))
        .expect(404);
    });
  });

  describe('AC-3: locating one venue without scrolling', () => {
    it('finds a venue by a name fragment', async () => {
      const res = await browse('coordinator', '?search=audit').expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Sandbox Auditorium');
    });

    it('matches case-insensitively', async () => {
      const res = await browse('coordinator', '?search=CAMPUS').expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Campus Green');
    });

    it('returns an empty list when nothing matches', async () => {
      const res = await browse('coordinator', '?search=nonexistent').expect(200);

      expect(res.body).toEqual([]);
    });

    it('sorts by name ascending by default', async () => {
      const res = await browse('coordinator').expect(200);

      expect(res.body.map((v: { name: string }) => v.name)).toEqual([
        'Campus Green',
        'Sandbox Auditorium',
        'Seminar Room 3-4',
      ]);
    });

    it('sorts by capacity', async () => {
      const res = await browse('coordinator', '?sortBy=capacity').expect(200);

      expect(res.body.map((v: { capacity: number }) => v.capacity)).toEqual([60, 420, 800]);
    });

    it('sorts descending when asked', async () => {
      const res = await browse('coordinator', '?sortBy=capacity&sortOrder=desc').expect(200);

      expect(res.body.map((v: { capacity: number }) => v.capacity)).toEqual([800, 420, 60]);
    });

    it('rejects an unknown sort field rather than ignoring it', async () => {
      const res = await browse('coordinator', '?sortBy=colour').expect(400);

      expect((res.body.message as string[]).join(' | ')).toMatch(/sortBy must be one of/);
    });

    it('rejects an unknown sort order', async () => {
      await browse('coordinator', '?sortBy=name&sortOrder=sideways').expect(400);
    });

    it('never widens visibility through a search', async () => {
      await seedVenue({ name: 'Hidden draft venue', status: VenueStatus.DRAFT });

      const res = await browse('coordinator', '?search=hidden').expect(200);

      expect(res.body).toEqual([]);
    });
  });

  describe('drafts stay excluded for non-owners (US-13 rule reused)', () => {
    it('hides another manager’s draft from a Coordinator', async () => {
      await seedVenue({ name: 'Unfinished', status: VenueStatus.DRAFT });

      const res = await browse('coordinator').expect(200);
      expect(res.body.map((v: { name: string }) => v.name)).not.toContain('Unfinished');
    });

    it('hides it from a different Venue Staff member', async () => {
      await seedVenue({ name: 'Unfinished', status: VenueStatus.DRAFT });

      const res = await browse('staffB').expect(200);
      expect(res.body.map((v: { name: string }) => v.name)).not.toContain('Unfinished');
    });

    it('shows it to its own manager, listed before published entries', async () => {
      await seedVenue({ name: 'Unfinished', status: VenueStatus.DRAFT });

      const res = await browse('staffA').expect(200);

      expect(res.body).toHaveLength(4);
      expect(res.body[0].name).toBe('Unfinished');
      expect(res.body[0].status).toBe(VenueStatus.DRAFT);
    });
  });

  describe('AC-4: the list reflects the latest persisted data', () => {
    it('shows a newly published venue on the next load', async () => {
      const before = await browse('coordinator').expect(200);
      expect(before.body).toHaveLength(3);

      const draft = await http()
        .post('/venues/drafts')
        .set('Authorization', as('staffA'))
        .send({ name: 'Innovation Lab', location: 'Research Wing', capacity: 35 })
        .expect(201);

      await http()
        .post(`/venues/${draft.body.id}/publish`)
        .set('Authorization', as('staffA'))
        .expect(200);

      const after = await browse('coordinator').expect(200);
      expect(after.body).toHaveLength(4);
      expect(after.body.map((v: { name: string }) => v.name)).toContain('Innovation Lab');
    });

    it('reflects an edit immediately', async () => {
      const list = await browse('staffA').expect(200);
      const target = list.body.find((v: { name: string }) => v.name === 'Campus Green');

      await http()
        .patch(`/venues/${target.id}`)
        .set('Authorization', as('staffA'))
        .send({ capacity: 1200 })
        .expect(200);

      const after = await browse('coordinator').expect(200);
      const updated = after.body.find((v: { name: string }) => v.name === 'Campus Green');
      expect(updated.capacity).toBe(1200);
    });

    it('tells caches not to store the catalogue', async () => {
      const res = await browse('coordinator').expect(200);

      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('tells caches not to store a single venue either', async () => {
      const list = await browse('coordinator').expect(200);

      const res = await http()
        .get(`/venues/${list.body[0].id}`)
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(res.headers['cache-control']).toBe('no-store');
    });
  });
});
