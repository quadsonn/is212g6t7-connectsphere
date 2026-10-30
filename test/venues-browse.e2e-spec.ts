import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, VenueStatus } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-15 (Browse the full catalogue of venues), integration tests: the real
 * Nest app over HTTP (Supertest) and the local test database, one describe per
 * acceptance criterion.
 *
 * Code under test: GET /venues (@RequirePermission VENUE/READ, BrowseVenuesDto:
 * search, sortBy name|capacity|location, sortOrder asc|desc) ->
 * VenuesService.findAllForUser(), which applies visibilityFilter() (US-13
 * AC-4), a case-insensitive name match, and orderBy() (drafts first, then the
 * chosen field, nulls last). GET /venues/:id -> findOneForUser(). Both send
 * Cache-Control: no-store.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql + base-venues.sql (published: VEN-002 Main
 * Hall 300, VEN-038 Seminar Room 40, VEN-004 Rooftop Terrace 120; draft:
 * VEN-001 "Annex (draft)"; all managed by USR-010) + tc-s1-96-setup.sql (a
 * second Venue Staff member, who manages none).
 */
describe('US-15 browse the venue catalogue (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const USERS = {
    staffA: 'venue.staff@example.com', // USR-010, manages every base venue
    staffB: 'venue.staff2@example.com', // USR-013, tc-s1-96-setup
    coordinator: 'coord.a@example.com',
    organiser: 'organiser@example.com',
    attendee: 'attendee@example.com',
  } as const;
  type Who = keyof typeof USERS;
  const DRAFT_NAME = 'Annex (draft)';

  const tokens: Record<string, string> = {};
  const as = (who: Who) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };
  const browse = (who: Who, query = '') =>
    http().get(`/venues${query}`).set('Authorization', as(who));
  const names = (body: { name: string }[]) => body.map((v) => v.name);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');

    prisma = new PrismaClient();

    await resetDb(prisma);
    await given('base-users', 'tc-s1-96-setup');
    for (const [key, email] of Object.entries(USERS)) {
      const res = await http().post('/auth/login').send({ email, password: PASSWORD }).expect(200);
      tokens[key] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await given('base-users', 'base-venues', 'tc-s1-96-setup');
  });

  describe('AC-1: the catalogue lists venues with key details', () => {
    // TC-S1-108 · US-15 AC-1 · setup: base-users + base-venues + tc-s1-96-setup · fails if a published venue was missing from the catalogue
    // Code: findAllForUser() returns every PUBLISHED venue (visibilityFilter()).
    it('returns every published venue', async () => {
      const res = await browse('coordinator').expect(200);

      expect(names(res.body).sort()).toEqual(['Main Hall', 'Rooftop Terrace', 'Seminar Room']);
    });

    // TC-S1-108 · US-15 AC-1 · setup: base-users + base-venues + tc-s1-96-setup · fails if a list entry lacked its name, location or capacity
    // Code: the list returns whole venue records, so the key details come with each entry.
    it('includes name, location and capacity at a glance', async () => {
      const res = await browse('coordinator').expect(200);

      expect(res.body.find((v: { id: string }) => v.id === 'VEN-002')).toMatchObject({
        name: 'Main Hall',
        location: 'Block A, Level 1',
        capacity: 300,
      });
      for (const venue of res.body) {
        expect(venue).toMatchObject({
          name: expect.any(String),
          location: expect.any(String),
          capacity: expect.any(Number),
        });
      }
    });

    // TC-S1-108 · US-15 AC-1 · setup: base-users + base-venues + tc-s1-96-setup · fails if Venue Staff (the story's role) or Coordinators could not open the catalogue
    // Code: both hold VENUE/READ.
    it('is available to Venue Staff and Coordinators', async () => {
      for (const who of ['staffA', 'staffB', 'coordinator'] as const) {
        await browse(who).expect(200);
      }
    });

    // TC-S1-108 · US-15 AC-1, US-02 · setup: base-users + base-venues + tc-s1-96-setup · fails if an Attendee could read the venue catalogue
    // Code: Attendees hold no VENUE/READ grant (403).
    it('gives an Attendee no access to the catalogue', async () => {
      await browse('attendee').expect(403);
    });

    // TC-S1-108 · US-15 AC-1, US-01 · setup: base-users + base-venues + tc-s1-96-setup · fails if the catalogue could be read without signing in
    // Code: JwtAuthGuard on VenuesController answers 401.
    it('refuses an unauthenticated caller', async () => {
      await http().get('/venues').expect(401);
    });
  });

  describe('AC-2: full detail on one venue', () => {
    // TC-S1-109 · US-15 AC-2 · setup: base-users + base-venues + tc-s1-96-setup · fails if opening a venue left out its facilities, accessibility, layouts or operating hours
    // Code: GET /venues/:id -> findOneForUser() returns the whole record.
    it('returns facilities, accessibility, layouts and operating hours', async () => {
      const res = await http()
        .get('/venues/VEN-002')
        .set('Authorization', as('staffB'))
        .expect(200);

      expect(res.body).toMatchObject({
        name: 'Main Hall',
        facilities: ['PROJECTOR', 'SOUND_SYSTEM', 'STAGE'],
        accessibilityFeatures: ['STEP_FREE_ACCESS', 'HEARING_LOOP'],
        supportedLayouts: ['THEATRE', 'BANQUET'],
        operatingInfo: '8:00 AM – 10:00 PM',
      });
    });

    // TC-S1-109 · US-15 AC-2 · setup: base-users + base-venues + tc-s1-96-setup · fails if an unknown id returned something other than not found
    // Code: findOneForUser() throws NotFoundException (404).
    it('reports an unknown venue as not found', async () => {
      await http()
        .get('/venues/VEN-999')
        .set('Authorization', as('coordinator'))
        .expect(404);
    });
  });

  describe('AC-3: locating one venue without scrolling', () => {
    // TC-S1-110 · US-15 AC-3 · setup: base-users + base-venues + tc-s1-96-setup · fails if looking a venue up by part of its name returned unrelated venues
    // Code: search -> name contains the text, mode 'insensitive'.
    it('finds a venue by a name fragment', async () => {
      const res = await browse('coordinator', '?search=hall').expect(200);

      expect(names(res.body)).toEqual(['Main Hall']);
    });

    // TC-S1-110 · US-15 AC-3 · setup: base-users + base-venues + tc-s1-96-setup · fails if the lookup depended on upper or lower case
    // Code: mode 'insensitive'.
    it('matches case-insensitively', async () => {
      const res = await browse('coordinator', '?search=ROOFTOP').expect(200);

      expect(names(res.body)).toEqual(['Rooftop Terrace']);
    });

    // TC-S1-110 · US-15 AC-3 · setup: base-users + base-venues + tc-s1-96-setup · fails if a lookup that matches nothing returned the whole list or an error
    // Code: the filter is applied in the query; no match is an empty list.
    it('returns an empty list when nothing matches', async () => {
      const res = await browse('coordinator', '?search=nonexistent').expect(200);

      expect(res.body).toEqual([]);
    });

    // TC-S1-110 · US-15 AC-3 · setup: base-users + base-venues + tc-s1-96-setup · fails if the catalogue was not in name order by default
    // Code: orderBy() defaults to sortBy name, sortOrder asc.
    it('sorts by name ascending by default', async () => {
      const res = await browse('coordinator').expect(200);

      expect(names(res.body)).toEqual(['Main Hall', 'Rooftop Terrace', 'Seminar Room']);
    });

    // TC-S1-110 · US-15 AC-3 · setup: base-users + base-venues + tc-s1-96-setup · fails if sorting by capacity did not order the venues by size
    // Code: sortBy=capacity.
    it('sorts by capacity', async () => {
      const res = await browse('coordinator', '?sortBy=capacity').expect(200);

      expect(res.body.map((v: { capacity: number }) => v.capacity)).toEqual([40, 120, 300]);
    });

    // TC-S1-110 · US-15 AC-3 · setup: base-users + base-venues + tc-s1-96-setup · fails if the largest venues could not be put first
    // Code: sortOrder=desc.
    it('sorts descending when asked', async () => {
      const res = await browse('coordinator', '?sortBy=capacity&sortOrder=desc').expect(200);

      expect(res.body.map((v: { capacity: number }) => v.capacity)).toEqual([300, 120, 40]);
    });

    // TC-S1-110 · US-15 AC-3 · setup: base-users + base-venues + tc-s1-96-setup · fails if an unknown sort field was silently ignored
    // Code: BrowseVenuesDto.sortBy is @IsEnum(VenueSortField) (400).
    it('rejects an unknown sort field rather than ignoring it', async () => {
      const res = await browse('coordinator', '?sortBy=colour').expect(400);

      expect((res.body.message as string[]).join(' | ')).toMatch(/sortBy must be one of/);
    });

    // TC-S1-110 · US-15 AC-3 · setup: base-users + base-venues + tc-s1-96-setup · fails if an unknown sort order was silently ignored
    // Code: BrowseVenuesDto.sortOrder is @IsEnum(SortOrder) (400).
    it('rejects an unknown sort order', async () => {
      await browse('coordinator', '?sortBy=name&sortOrder=sideways').expect(400);
    });

    // TC-S1-110 · US-15 AC-3, US-13 AC-4 · setup: base-users + base-venues + tc-s1-96-setup · fails if searching for a draft's name revealed it to a Coordinator
    // Code: the search is ANDed with visibilityFilter().
    it('never widens visibility through a search', async () => {
      const res = await browse('coordinator', '?search=annex').expect(200);

      expect(res.body).toEqual([]);
    });
  });

  describe('drafts stay excluded for non-owners (US-13 rule reused)', () => {
    // TC-S1-99 · US-13 AC-4 · setup: base-users + base-venues + tc-s1-96-setup · fails if a Coordinator browsing the catalogue saw a draft
    // Code: visibilityFilter() admits a DRAFT only for its manager.
    it('hides another manager’s draft from a Coordinator', async () => {
      const res = await browse('coordinator').expect(200);

      expect(names(res.body)).not.toContain(DRAFT_NAME);
    });

    // TC-S1-99 · US-13 AC-4 · setup: base-users + base-venues + tc-s1-96-setup · fails if a Venue Staff member saw a draft they don't manage
    // Code: managedById must be the caller (VEN-001 is USR-010's).
    it('hides it from a different Venue Staff member', async () => {
      const res = await browse('staffB').expect(200);

      expect(names(res.body)).not.toContain(DRAFT_NAME);
    });

    // TC-S1-101 · US-13 AC-6, US-15 AC-1 · setup: base-users + base-venues + tc-s1-96-setup · fails if the manager's catalogue left out their draft or did not mark it as one
    // Code: orderBy() sorts status ascending first, so DRAFT comes before PUBLISHED.
    it('shows it to its own manager, listed before published entries', async () => {
      const res = await browse('staffA').expect(200);

      expect(res.body).toHaveLength(4);
      expect(res.body[0].name).toBe(DRAFT_NAME);
      expect(res.body[0].status).toBe(VenueStatus.DRAFT);
    });
  });

  describe('US-13 AC-5 / US-14 AC-2: the list reflects the latest saved data', () => {
    // TC-S1-100 · US-13 AC-5 · setup: base-users + base-venues + tc-s1-96-setup · fails if a newly published venue was missing from the next load
    // Code: findAllForUser() reads the database on every call; nothing is cached server-side.
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
      expect(names(after.body)).toContain('Innovation Lab');
    });

    // TC-S1-104 · US-14 AC-2 · setup: base-users + base-venues + tc-s1-96-setup · fails if an edit was not in the Coordinator's next load
    // Code: as above.
    it('reflects an edit immediately', async () => {
      await http()
        .patch('/venues/VEN-004')
        .set('Authorization', as('staffA'))
        .send({ capacity: 1200 })
        .expect(200);

      const after = await browse('coordinator').expect(200);
      const updated = after.body.find((v: { name: string }) => v.name === 'Rooftop Terrace');
      expect(updated.capacity).toBe(1200);
    });

    // TC-S1-104 · US-14 AC-2 · setup: base-users + base-venues + tc-s1-96-setup · fails if a browser or proxy could keep showing an old copy of the catalogue
    // Code: GET /venues sends Cache-Control: no-store.
    it('tells caches not to store the catalogue', async () => {
      const res = await browse('coordinator').expect(200);

      expect(res.headers['cache-control']).toBe('no-store');
    });

    // TC-S1-104 · US-14 AC-2 · setup: base-users + base-venues + tc-s1-96-setup · fails if a browser could keep showing an old copy of one venue
    // Code: GET /venues/:id sends Cache-Control: no-store.
    it('tells caches not to store a single venue either', async () => {
      const res = await http()
        .get('/venues/VEN-002')
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(res.headers['cache-control']).toBe('no-store');
    });
  });
});
