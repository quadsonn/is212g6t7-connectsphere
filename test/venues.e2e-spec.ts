import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, VenueStatus } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-13 (Add a new venue with its key characteristics), integration tests:
 * the real Nest app over HTTP (Supertest) and the local test database, one
 * describe per acceptance criterion.
 *
 * Code under test: POST /venues/drafts, PATCH /venues/:id and
 * POST /venues/:id/publish (@Roles VENUE_STAFF) -> VenuesService.saveDraft(),
 * updateDraft() and publish(). VenueDraftDto lets every field be missing; publish()
 * checks the stored row against PublishableVenueDto (name, location, capacity).
 * GET /venues and GET /venues/:id apply visibilityFilter(): every PUBLISHED
 * venue, plus DRAFTs whose managedById is the caller.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql + tc-s1-96-setup.sql (a second Venue Staff
 * member). No venues exist at the start; each test creates its own through
 * the API, as the story does.
 */
describe('US-13 venue drafts and publishing (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const USERS = {
    staffA: 'venue.staff@example.com', // USR-010
    staffB: 'venue.staff2@example.com', // USR-013, tc-s1-96-setup
    coordinator: 'coord.a@example.com',
    organiser: 'organiser@example.com',
    attendee: 'attendee@example.com',
  } as const;
  type Who = keyof typeof USERS;

  const tokens: Record<string, string> = {};
  const as = (who: Who) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  const completeVenue = {
    name: 'Sandbox Auditorium',
    location: 'School of Computing, Level 1',
    capacity: 420,
  };

  const createDraft = (body: Record<string, unknown>, who: Who = 'staffA') =>
    http().post('/venues/drafts').set('Authorization', as(who)).send(body);
  const publish = (id: string, who: Who = 'staffA') =>
    http().post(`/venues/${id}/publish`).set('Authorization', as(who));

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
    await given('base-users', 'tc-s1-96-setup');
  });

  describe('AC-1: every venue detail can be specified', () => {
    // TC-S1-96 · US-13 AC-1 · setup: base-users + tc-s1-96-setup · fails if any of the AC's details could not be given when adding a venue
    // Code: VenueDraftDto accepts location, capacity, facilities, accessibilityFeatures, supportedLayouts and
    // operatingInfo; saveDraft() stores them as sent.
    it('accepts location, capacity, facilities, accessibility, layouts and hours', async () => {
      const res = await createDraft({
        name: 'Campus Green',
        location: 'Outdoor, adjacent to Library',
        capacity: 800,
        facilities: ['POWER_OUTLETS'],
        accessibilityFeatures: ['STEP_FREE_ACCESS', 'ACCESSIBLE_RESTROOMS'],
        supportedLayouts: ['BANQUET', 'THEATRE'],
        operatingInfo: 'Daily, subject to weather',
      }).expect(201);

      expect(res.body).toMatchObject({
        name: 'Campus Green',
        location: 'Outdoor, adjacent to Library',
        capacity: 800,
        facilities: ['POWER_OUTLETS'],
        accessibilityFeatures: ['STEP_FREE_ACCESS', 'ACCESSIBLE_RESTROOMS'],
        supportedLayouts: ['BANQUET', 'THEATRE'],
        operatingInfo: 'Daily, subject to weather',
      });
    });

    // TC-S1-96 · US-13 AC-1, US-18 · setup: base-users + tc-s1-96-setup · fails if facilities or accessibility outside the shared lists were stored
    // Code: @IsEnum(Facility / AccessibilityFeature, { each: true }) (US-18 vocabulary) -> 400.
    it('US-18: rejects facilities or accessibility outside the controlled vocabulary', async () => {
      for (const body of [
        { facilities: ['Marquee points'] },
        { accessibilityFeatures: ['Step-free access'] },
      ]) {
        const res = await createDraft(body).expect(400);

        expect(JSON.stringify(res.body.message)).toMatch(/must contain only/);
      }
    });

    // TC-S1-96 · US-13 AC-1, US-06 · setup: base-users + tc-s1-96-setup · fails if a venue could list a layout an event request can't ask for
    // Code: supportedLayouts uses the RoomLayout enum that EventRequest.preferredLayout uses (400 otherwise).
    it('rejects a layout outside the shared US-06 vocabulary', async () => {
      const res = await createDraft({ supportedLayouts: ['CABARET'] }).expect(400);

      expect((res.body.message as string[]).join(' | ')).toMatch(
        /supportedLayouts must contain only/,
      );
    });

    // TC-S1-96 · US-13 AC-1 · setup: base-users + tc-s1-96-setup · fails if a capacity that isn't a number was stored
    // Code: capacity is @IsInt @IsPositive (400 otherwise).
    it('rejects a non-numeric capacity', async () => {
      await createDraft({ capacity: 'lots' }).expect(400);
    });
  });

  describe('AC-2: an incomplete venue saves as a draft', () => {
    // TC-S1-97 · US-13 AC-2 · setup: base-users + tc-s1-96-setup · fails if a venue with no details could not be saved as a draft
    // Code: every VenueDraftDto field is @IsOptional; the row is created as DRAFT (the schema default).
    it('saves with nothing filled in', async () => {
      const res = await createDraft({}).expect(201);

      expect(res.body.status).toBe(VenueStatus.DRAFT);
      expect(res.body.name).toBeNull();
      expect(res.body.capacity).toBeNull();
    });

    // TC-S1-97 · US-13 AC-2 · setup: base-users + tc-s1-96-setup · fails if a partly filled venue could not be saved, or a blank field was invented
    // Code: saveDraft() stores only the fields sent; the rest stay NULL.
    it('saves a partially filled venue', async () => {
      const res = await createDraft({ name: 'Half done' }).expect(201);

      expect(res.body.name).toBe('Half done');
      expect(res.body.location).toBeNull();
    });

    // TC-S1-97 · US-13 AC-2 · setup: base-users + tc-s1-96-setup · fails if a later edit of a draft wiped what an earlier edit saved
    // Code: PATCH /venues/:id -> updateDraft() writes only the fields in the body.
    it('can be completed over several edits', async () => {
      const created = await createDraft({ name: 'Sandbox Auditorium' }).expect(201);

      await http()
        .patch(`/venues/${created.body.id}`)
        .set('Authorization', as('staffA'))
        .send({ location: 'School of Computing, Level 1' })
        .expect(200);

      const res = await http()
        .patch(`/venues/${created.body.id}`)
        .set('Authorization', as('staffA'))
        .send({ capacity: 420 })
        .expect(200);

      // Earlier values survived the partial edits.
      expect(res.body).toMatchObject({
        name: 'Sandbox Auditorium',
        location: 'School of Computing, Level 1',
        capacity: 420,
      });
    });

    // TC-S1-97 · US-13 AC-2, US-02 · setup: base-users + tc-s1-96-setup · fails if a role other than Venue Staff could add a venue
    // Code: POST /venues/drafts is @Roles(VENUE_STAFF); RolesGuard answers 403 before the service runs.
    it.each(['coordinator', 'attendee'] as const)('refuses %s at the role gate', async (who) => {
      await createDraft({ name: 'Nope' }, who).expect(403);
      expect(await prisma.venue.count()).toBe(0);
    });
  });

  describe('AC-3: publishing is blocked until required fields are complete', () => {
    // TC-S1-98 · US-13 AC-3 · setup: base-users + tc-s1-96-setup · fails if an empty draft could be published, or the refusal did not say what is missing
    // Code: publish() validates the stored row against PublishableVenueDto and answers 400 with one message per field.
    it('blocks an empty draft and names each missing field', async () => {
      const created = await createDraft({}).expect(201);

      const res = await publish(created.body.id).expect(400);

      const messages = (res.body.message as string[]).join(' | ');
      expect(messages).toMatch(/name is required/);
      expect(messages).toMatch(/location is required/);
      expect(messages).toMatch(/capacity is required/);

      const stored = await prisma.venue.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      expect(stored.status).toBe(VenueStatus.DRAFT);
    });

    // TC-S1-98 · US-13 AC-3 · setup: base-users + tc-s1-96-setup · fails if a draft missing only the capacity (the AC's example) could be published
    // Code: PublishableVenueDto.capacity is required (@IsInt: "capacity is required before publishing").
    it('blocks a draft missing only capacity', async () => {
      const created = await createDraft({
        name: 'Sandbox Auditorium',
        location: 'Level 1',
      }).expect(201);

      const res = await publish(created.body.id).expect(400);

      expect((res.body.message as string[]).join(' | ')).toMatch(/capacity is required/);
    });

    // TC-S1-98 · US-13 AC-3 · setup: base-users + tc-s1-96-setup · fails if a complete venue was held back for a field the AC doesn't require
    // Code: only name, location and capacity are required to publish.
    it('publishes without facilities, layouts or operating hours', async () => {
      const created = await createDraft(completeVenue).expect(201);

      await publish(created.body.id).expect(200);
    });
  });

  describe('AC-4: drafts are invisible to everyone but their manager', () => {
    // TC-S1-99 · US-13 AC-4 · setup: base-users + tc-s1-96-setup · fails if a Coordinator browsing the catalogue saw a draft
    // Code: findAllForUser() filters with visibilityFilter(user): PUBLISHED, or DRAFT managed by the caller.
    it('hides a draft from a Coordinator browsing the catalogue', async () => {
      await createDraft({ name: 'Unfinished venue' }).expect(201);

      const res = await http()
        .get('/venues')
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(res.body).toHaveLength(0);
    });

    // TC-S1-99 · US-13 AC-4 · setup: base-users + tc-s1-96-setup · fails if a Venue Staff member saw a draft they don't manage
    // Code: the DRAFT branch of visibilityFilter() matches managedById = the caller only.
    it('hides a draft from another Venue Staff member', async () => {
      await createDraft({ name: 'Staff A draft' }, 'staffA').expect(201);

      const res = await http()
        .get('/venues')
        .set('Authorization', as('staffB'))
        .expect(200);

      expect(res.body).toHaveLength(0);
    });

    // TC-S1-99 · US-13 AC-4 · setup: base-users + tc-s1-96-setup · fails if the managing Venue Staff member could not see their own draft
    // Code: saveDraft() sets managedById to the creator, so the DRAFT branch admits them.
    it('shows the draft to its own manager', async () => {
      await createDraft({ name: 'Staff A draft' }, 'staffA').expect(201);

      const res = await http()
        .get('/venues')
        .set('Authorization', as('staffA'))
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Staff A draft');
    });

    // TC-S1-99 · US-13 AC-4 · setup: base-users + tc-s1-96-setup · fails if a draft could be read by id by someone else, or its details leaked in the error
    // Code: findOneForUser() applies the same visibilityFilter(); an invisible venue is 404.
    it('denies fetching another manager’s draft by id', async () => {
      const created = await createDraft({ name: 'Staff A draft' }, 'staffA').expect(201);

      const res = await http()
        .get(`/venues/${created.body.id}`)
        .set('Authorization', as('coordinator'))
        .expect(404);

      expect(JSON.stringify(res.body)).not.toMatch(/Staff A draft/);
    });

    // TC-S1-99 · US-13 AC-4 · setup: base-users + tc-s1-96-setup · fails if another Venue Staff member could edit or publish a draft they don't manage
    // Code: updateDraft() and publish() load the venue through findManaged(), which matches managedById (404 otherwise).
    it('refuses another manager’s attempt to edit or publish it', async () => {
      const created = await createDraft(completeVenue, 'staffA').expect(201);

      await http()
        .patch(`/venues/${created.body.id}`)
        .set('Authorization', as('staffB'))
        .send({ capacity: 1 })
        .expect(404);

      await publish(created.body.id, 'staffB').expect(404);
    });

    // TC-S1-99 · US-13 AC-4, US-01 · setup: base-users + tc-s1-96-setup · fails if the catalogue could be read without signing in
    // Code: JwtAuthGuard on VenuesController answers 401.
    it('refuses an unauthenticated caller', async () => {
      await http().get('/venues').expect(401);
    });
  });

  describe('AC-5: publishing persists and the venue enters the catalogue', () => {
    // TC-S1-100 · US-13 AC-5 · setup: base-users + tc-s1-96-setup · fails if a published venue was missing from the Coordinator's next load of the catalogue
    // Code: publish() sets status PUBLISHED; GET /venues reads the database on every call (Cache-Control: no-store).
    it('appears to a Coordinator on the next load', async () => {
      const created = await createDraft(completeVenue).expect(201);

      const before = await http()
        .get('/venues')
        .set('Authorization', as('coordinator'))
        .expect(200);
      expect(before.body).toHaveLength(0);

      await publish(created.body.id).expect(200);

      const after = await http()
        .get('/venues')
        .set('Authorization', as('coordinator'))
        .expect(200);
      expect(after.body).toHaveLength(1);
      expect(after.body[0].name).toBe('Sandbox Auditorium');
    });

    // TC-S1-100 · US-13 AC-5 · setup: base-users + tc-s1-96-setup · fails if publishing was not saved to the database
    // Code: publish() -> prisma.venue.update({ status: PUBLISHED }).
    it('persists the change', async () => {
      const created = await createDraft(completeVenue).expect(201);

      await publish(created.body.id).expect(200);

      const stored = await prisma.venue.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      expect(stored.status).toBe(VenueStatus.PUBLISHED);
    });

    // TC-S1-100 · US-13 AC-5 · setup: base-users + tc-s1-96-setup · fails if publishing twice errored or created a second entry
    // Code: publish() returns an already-published venue unchanged.
    it('is idempotent', async () => {
      const created = await createDraft(completeVenue).expect(201);

      await publish(created.body.id).expect(200);
      await publish(created.body.id).expect(200);

      expect(await prisma.venue.count({ where: { status: VenueStatus.PUBLISHED } })).toBe(1);
    });

    // TC-S1-100 · US-13 AC-5 · setup: base-users + tc-s1-96-setup · fails if a published venue stayed hidden from an Organiser planning an event
    // Code: GET /venues is @RequirePermission(VENUE, READ), which Organisers hold; the PUBLISHED branch admits them.
    it('becomes visible to an Organiser too', async () => {
      const created = await createDraft(completeVenue).expect(201);
      await publish(created.body.id).expect(200);

      const res = await http()
        .get('/venues')
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body).toHaveLength(1);
    });
  });

  describe('AC-6: published and draft are distinguishable', () => {
    // TC-S1-101 · US-13 AC-6 · setup: base-users + tc-s1-96-setup · fails if the Venue Staff member's catalogue did not say which entries are drafts
    // Code: every venue in GET /venues carries status (DRAFT or PUBLISHED); the screen shows it as a badge (TC-S1-101 UI).
    it('labels each entry with its status', async () => {
      const draft = await createDraft({ name: 'Still a draft' }).expect(201);
      const toPublish = await createDraft(completeVenue).expect(201);

      await publish(toPublish.body.id).expect(200);

      const res = await http()
        .get('/venues')
        .set('Authorization', as('staffA'))
        .expect(200);

      const byName = Object.fromEntries(
        res.body.map((v: { name: string; status: string }) => [v.name, v.status]),
      );
      expect(byName['Still a draft']).toBe(VenueStatus.DRAFT);
      expect(byName['Sandbox Auditorium']).toBe(VenueStatus.PUBLISHED);
      expect(draft.body.status).toBe(VenueStatus.DRAFT);
    });

    // TC-S1-101 · US-13 AC-6 · setup: base-users + tc-s1-96-setup · fails if a single venue's view left out whether it is a draft
    // Code: GET /venues/:id returns the same status field.
    it('shows the status on a single entry too', async () => {
      const created = await createDraft(completeVenue).expect(201);

      const res = await http()
        .get(`/venues/${created.body.id}`)
        .set('Authorization', as('staffA'))
        .expect(200);

      expect(res.body.status).toBe(VenueStatus.DRAFT);
    });
  });

  describe('route resolution', () => {
    // TC-S1-101 · US-13 AC-6 · setup: base-users + tc-s1-96-setup · fails if GET /venues was routed to the single-venue handler
    // Code: the static routes are declared before GET /venues/:id.
    it('does not treat "drafts" as a venue id', async () => {
      await createDraft(completeVenue).expect(201);

      const res = await http()
        .get('/venues')
        .set('Authorization', as('staffA'))
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
