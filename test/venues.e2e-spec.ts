import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, Role, VenueStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { listenOnLoopback } from './listen-on-loopback';

/** US-13 e2e — one describe per acceptance criterion. */
describe('US-13 venue drafts and publishing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const completeVenue = {
    name: 'Sandbox Auditorium',
    location: 'School of Computing, Level 1',
    capacity: 420,
  };

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: key, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
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
    await prisma.venueBooking.deleteMany();
    await prisma.venue.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();

    await seedUser('staffA', 'staff.a@example.com', Role.VENUE_STAFF);
    await seedUser('staffB', 'staff.b@example.com', Role.VENUE_STAFF);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);
    await seedUser('attendee', 'attendee@example.com', Role.ATTENDEE);
  });

  const createDraft = (body: Record<string, unknown>, who = 'staffA') =>
    http().post('/venues/drafts').set('Authorization', as(who)).send(body);

  describe('AC-1: every venue detail can be specified', () => {
    it('US-18: rejects facilities or accessibility outside the controlled vocabulary', async () => {
      for (const body of [
        { facilities: ['Marquee points'] },
        { accessibilityFeatures: ['Step-free access'] },
      ]) {
        const res = await http()
          .post('/venues/drafts')
          .set('Authorization', as('staffA'))
          .send(body)
          .expect(400);

        expect(JSON.stringify(res.body.message)).toMatch(/must contain only/);
      }
    });

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

    it('rejects a layout outside the shared US-06 vocabulary', async () => {
      const res = await createDraft({ supportedLayouts: ['CABARET'] }).expect(400);

      expect((res.body.message as string[]).join(' | ')).toMatch(
        /supportedLayouts must contain only/,
      );
    });

    it('rejects a non-numeric capacity', async () => {
      await createDraft({ capacity: 'lots' }).expect(400);
    });
  });

  describe('AC-2: an incomplete venue saves as a draft', () => {
    it('saves with nothing filled in', async () => {
      const res = await createDraft({}).expect(201);

      expect(res.body.status).toBe(VenueStatus.DRAFT);
      expect(res.body.name).toBeNull();
      expect(res.body.capacity).toBeNull();
    });

    it('saves a partially filled venue', async () => {
      const res = await createDraft({ name: 'Half done' }).expect(201);

      expect(res.body.name).toBe('Half done');
      expect(res.body.location).toBeNull();
    });

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

    it.each(['coordinator', 'attendee'])('refuses %s at the role gate', async (who) => {
      await createDraft({ name: 'Nope' }, who).expect(403);
      expect(await prisma.venue.count()).toBe(0);
    });
  });

  describe('AC-3: publishing is blocked until required fields are complete', () => {
    it('blocks an empty draft and names each missing field', async () => {
      const created = await createDraft({}).expect(201);

      const res = await http()
        .post(`/venues/${created.body.id}/publish`)
        .set('Authorization', as('staffA'))
        .expect(400);

      const messages = (res.body.message as string[]).join(' | ');
      expect(messages).toMatch(/name is required/);
      expect(messages).toMatch(/location is required/);
      expect(messages).toMatch(/capacity is required/);

      const stored = await prisma.venue.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      expect(stored.status).toBe(VenueStatus.DRAFT);
    });

    it('blocks a draft missing only capacity', async () => {
      const created = await createDraft({
        name: 'Sandbox Auditorium',
        location: 'Level 1',
      }).expect(201);

      const res = await http()
        .post(`/venues/${created.body.id}/publish`)
        .set('Authorization', as('staffA'))
        .expect(400);

      expect((res.body.message as string[]).join(' | ')).toMatch(/capacity is required/);
    });

    it('publishes without facilities, layouts or operating hours', async () => {
      const created = await createDraft(completeVenue).expect(201);

      await http()
        .post(`/venues/${created.body.id}/publish`)
        .set('Authorization', as('staffA'))
        .expect(200);
    });
  });

  describe('AC-4: drafts are invisible to everyone but their manager', () => {
    it('hides a draft from a Coordinator browsing the catalogue', async () => {
      await createDraft({ name: 'Unfinished venue' }).expect(201);

      const res = await http()
        .get('/venues')
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(res.body).toHaveLength(0);
    });

    it('hides a draft from another Venue Staff member', async () => {
      await createDraft({ name: 'Staff A draft' }, 'staffA').expect(201);

      const res = await http()
        .get('/venues')
        .set('Authorization', as('staffB'))
        .expect(200);

      expect(res.body).toHaveLength(0);
    });

    it('shows the draft to its own manager', async () => {
      await createDraft({ name: 'Staff A draft' }, 'staffA').expect(201);

      const res = await http()
        .get('/venues')
        .set('Authorization', as('staffA'))
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Staff A draft');
    });

    it('denies fetching another manager’s draft by id', async () => {
      const created = await createDraft({ name: 'Staff A draft' }, 'staffA').expect(201);

      const res = await http()
        .get(`/venues/${created.body.id}`)
        .set('Authorization', as('coordinator'))
        .expect(404);

      expect(JSON.stringify(res.body)).not.toMatch(/Staff A draft/);
    });

    it('refuses another manager’s attempt to edit or publish it', async () => {
      const created = await createDraft(completeVenue, 'staffA').expect(201);

      await http()
        .patch(`/venues/${created.body.id}`)
        .set('Authorization', as('staffB'))
        .send({ capacity: 1 })
        .expect(404);

      await http()
        .post(`/venues/${created.body.id}/publish`)
        .set('Authorization', as('staffB'))
        .expect(404);
    });

    it('refuses an unauthenticated caller', async () => {
      await http().get('/venues').expect(401);
    });
  });

  describe('AC-5: publishing persists and the venue enters the catalogue', () => {
    it('appears to a Coordinator on the next load', async () => {
      const created = await createDraft(completeVenue).expect(201);

      const before = await http()
        .get('/venues')
        .set('Authorization', as('coordinator'))
        .expect(200);
      expect(before.body).toHaveLength(0);

      await http()
        .post(`/venues/${created.body.id}/publish`)
        .set('Authorization', as('staffA'))
        .expect(200);

      const after = await http()
        .get('/venues')
        .set('Authorization', as('coordinator'))
        .expect(200);
      expect(after.body).toHaveLength(1);
      expect(after.body[0].name).toBe('Sandbox Auditorium');
    });

    it('persists the change', async () => {
      const created = await createDraft(completeVenue).expect(201);

      await http()
        .post(`/venues/${created.body.id}/publish`)
        .set('Authorization', as('staffA'))
        .expect(200);

      const stored = await prisma.venue.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      expect(stored.status).toBe(VenueStatus.PUBLISHED);
    });

    it('is idempotent', async () => {
      const created = await createDraft(completeVenue).expect(201);

      await http()
        .post(`/venues/${created.body.id}/publish`)
        .set('Authorization', as('staffA'))
        .expect(200);
      await http()
        .post(`/venues/${created.body.id}/publish`)
        .set('Authorization', as('staffA'))
        .expect(200);

      expect(await prisma.venue.count({ where: { status: VenueStatus.PUBLISHED } })).toBe(1);
    });

    it('becomes visible to an Organiser too', async () => {
      const created = await createDraft(completeVenue).expect(201);
      await http()
        .post(`/venues/${created.body.id}/publish`)
        .set('Authorization', as('staffA'))
        .expect(200);

      // Organisers hold VENUE/READ so they can see where their event might go.
      await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
      const res = await http()
        .get('/venues')
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body).toHaveLength(1);
    });
  });

  describe('AC-6: published and draft are distinguishable', () => {
    it('labels each entry with its status', async () => {
      const draft = await createDraft({ name: 'Still a draft' }).expect(201);
      const toPublish = await createDraft(completeVenue).expect(201);

      await http()
        .post(`/venues/${toPublish.body.id}/publish`)
        .set('Authorization', as('staffA'))
        .expect(200);

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
