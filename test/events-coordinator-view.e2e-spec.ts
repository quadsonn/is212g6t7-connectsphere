import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-12 (View all details of a submitted event request), integration tests:
 * the real Nest app over HTTP (Supertest) and the local test database, one
 * describe per acceptance criterion.
 *
 * Code under test: GET /events/assigned and GET /events/assigned/:id
 * (@Roles EVENT_COORDINATOR) -> EventsService.findAssignedRequests() /
 * findAssignedRequest(), which load the event through AccessControlService
 * (ASSIGNED scope: coordinatorId = caller) and return every stored field plus
 * the Organiser's contact.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql + tc-s1-22-setup.sql + tc-s1-54-setup.sql
 * (EVT-153, every detail filled in, assigned to coord.a); the AC-2 and AC-3
 * edge cases also load tc-s1-84-setup.sql.
 */
describe('US-12 coordinator views all details (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';

  /** base-users.sql, plus the second Organiser from tc-s1-22-setup.sql. */
  const USERS = {
    organiser: 'organiser@example.com',
    otherOrganiser: 'other@example.com',
    coordinatorA: 'coord.a@example.com',
    coordinatorB: 'coord.b@example.com',
    attendee: 'attendee@example.com',
    venueStaff: 'venue.staff@example.com',
  } as const;
  type Who = keyof typeof USERS;

  /** tc-s1-54-setup.sql and tc-s1-84-setup.sql. */
  const EVENT = { full: 'EVT-153', bare: 'EVT-163', unassigned: 'EVT-164', draft: 'EVT-165' } as const;

  const tokens: Record<string, string> = {};
  const as = (who: Who) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const open = (id: string, who: Who = 'coordinatorA') =>
    http().get(`/events/assigned/${id}`).set('Authorization', as(who));
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');

    prisma = new PrismaClient();

    await resetDb(prisma);
    await given('base-users', 'tc-s1-22-setup');
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
    await given('base-users', 'tc-s1-22-setup', 'tc-s1-54-setup');
  });

  describe('AC-1: the assigned Coordinator sees every core detail', () => {
    // TC-S1-84 · US-12 AC-1 · setup: base-users + tc-s1-22-setup + tc-s1-54-setup · fails if a core detail was missing or altered for the assigned Coordinator
    // Code: findAssignedRequest() returns the stored row: name, purpose, description, category, dates, attendance, status.
    it('returns name, purpose, description, dates and attendance', async () => {
      const res = await open(EVENT.full).expect(200);

      expect(res.body).toMatchObject({
        name: 'Freshman Orientation 2030',
        purpose: 'Welcome new students and introduce campus services',
        description: 'Full-day programme with talks, booths and a closing social',
        category: 'Student engagement',
        expectedAttendance: 320,
        status: EventStatus.SUBMITTED,
      });
      expect(new Date(res.body.proposedStart).toISOString()).toBe('2030-10-01T09:00:00.000Z');
      expect(new Date(res.body.proposedEnd).toISOString()).toBe('2030-10-01T17:00:00.000Z');
    });

    // TC-S1-84 · US-12 AC-1 · setup: base-users + tc-s1-22-setup + tc-s1-54-setup · fails if the venue requirements were missing
    // Code: the same row carries preferredLayout, layoutNotes and expectedAttendance (what a venue must fit).
    it('returns the venue requirements', async () => {
      const res = await open(EVENT.full).expect(200);

      expect(res.body).toMatchObject({
        preferredLayout: 'THEATRE',
        layoutNotes: 'Centre aisle, front row reserved',
        expectedAttendance: 320,
      });
    });

    // TC-S1-84 · US-12 AC-1 · setup: base-users + tc-s1-22-setup + tc-s1-54-setup · fails if the accessibility needs were missing
    // Code: accessibilityRequirements (enum list) and accessibilityNotes come back as stored.
    it('returns the accessibility needs', async () => {
      const res = await open(EVENT.full).expect(200);

      expect(res.body.accessibilityRequirements).toEqual(['STEP_FREE_ACCESS', 'HEARING_LOOP']);
      expect(res.body.accessibilityNotes).toBe('Ramp access to the stage');
    });

    // TC-S1-84 · US-12 AC-1 · setup: base-users + tc-s1-22-setup + tc-s1-54-setup · fails if the Coordinator could not tell who raised the request
    // Code: findAssignedRequest() includes the organiser's id, name and email.
    it('identifies who raised the request', async () => {
      const res = await open(EVENT.full).expect(200);

      expect(res.body.organiser).toMatchObject({ id: 'USR-006', email: 'organiser@example.com' });
    });

    // TC-S1-84 · US-12 AC-1 · setup: base-users + tc-s1-22-setup + tc-s1-54-setup · fails if the Coordinator's list showed less than the single view
    // Code: GET /events/assigned (findAssignedRequests) returns the same full rows.
    it('lists the assigned requests with the same detail', async () => {
      const res = await http().get('/events/assigned').set('Authorization', as('coordinatorA')).expect(200);

      expect(res.body).toEqual([
        expect.objectContaining({ id: EVENT.full, name: 'Freshman Orientation 2030', preferredLayout: 'THEATRE', expectedAttendance: 320 }),
      ]);
    });
  });

  describe('AC-2: equipment and registration requirements', () => {
    // TC-S1-85 · US-12 AC-2 · setup: base-users + tc-s1-22-setup + tc-s1-54-setup · fails if equipment needs were not shown with the core details
    // Code: equipmentNeeds is part of the same response as the core details.
    it('shows equipment needs alongside the core details', async () => {
      const res = await open(EVENT.full).expect(200);

      expect(res.body).toMatchObject({
        name: 'Freshman Orientation 2030',
        equipmentNeeds: 'Six wireless microphones, two projectors',
      });
    });

    // TC-S1-85 · US-12 AC-2 · setup: base-users + tc-s1-22-setup + tc-s1-54-setup · fails if the registration requirement was not shown
    // Code: registrationEnabled comes back with the request.
    it('shows the registration setting', async () => {
      const res = await open(EVENT.full).expect(200);

      expect(res.body.registrationEnabled).toBe(true);
    });

    // TC-S1-85 · US-12 AC-2 · setup: base-users + tc-s1-22-setup + tc-s1-54-setup + tc-s1-84-setup · fails if absent requirements were dropped instead of shown as none
    // Code: the full row is returned, so empty fields come back as null / [] / false rather than missing.
    it('reports absent requirements explicitly rather than omitting the keys', async () => {
      await given('tc-s1-84-setup');

      const res = await open(EVENT.bare).expect(200);

      expect(res.body).toHaveProperty('equipmentNeeds', null);
      expect(res.body).toHaveProperty('accessibilityNotes', null);
      expect(res.body.accessibilityRequirements).toEqual([]);
      expect(res.body.registrationEnabled).toBe(false);
    });
  });

  describe('AC-3: anyone not associated gets no event data', () => {
    // TC-S1-86 · US-12 AC-3 · setup: base-users + tc-s1-22-setup + tc-s1-54-setup · fails if another Coordinator could open the request or see any of it
    // Code: assertEventAccess() under ASSIGNED scope finds no row for coord.b, so 404 with no event data.
    it('denies a Coordinator the request is not assigned to', async () => {
      const res = await open(EVENT.full, 'coordinatorB').expect(404);

      expect(res.body.name).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toMatch(/Freshman/);
    });

    // TC-S1-86 · US-12 AC-3 · setup: base-users + tc-s1-22-setup + tc-s1-54-setup · fails if another Coordinator's list included the request
    // Code: findAssignedRequests() filters coordinatorId = caller.
    it('keeps it out of another Coordinator’s list', async () => {
      const res = await http().get('/events/assigned').set('Authorization', as('coordinatorB')).expect(200);

      expect(res.body).toEqual([]);
    });

    // TC-S1-86 · US-12 AC-3 · setup: base-users + tc-s1-22-setup + tc-s1-54-setup · fails if a non-Coordinator could use the Coordinator's view
    // Code: GET /events/assigned/:id is @Roles(EVENT_COORDINATOR); RolesGuard answers 403 with no event data.
    it.each(['organiser', 'otherOrganiser', 'attendee', 'venueStaff'] as const)('refuses %s at the role gate', async (who) => {
      const res = await open(EVENT.full, who).expect(403);

      expect(JSON.stringify(res.body)).not.toMatch(/Freshman/);
    });

    // TC-S1-86 · US-12 AC-3 · setup: base-users + tc-s1-22-setup + tc-s1-54-setup · fails if the details came back without signing in
    // Code: JwtAuthGuard answers 401.
    it('refuses an unauthenticated caller', async () => {
      const res = await http().get(`/events/assigned/${EVENT.full}`).expect(401);

      expect(JSON.stringify(res.body)).not.toMatch(/Freshman/);
    });

    // TC-S1-86 · US-12 AC-3 · setup: base-users + tc-s1-22-setup + tc-s1-54-setup · fails if a refusal leaked the Organiser's contact details
    // Code: the 404 is the plain error envelope; the organiser include is never built.
    it('does not leak the organiser’s contact details on denial', async () => {
      const res = await open(EVENT.full, 'coordinatorB').expect(404);

      expect(JSON.stringify(res.body)).not.toMatch(/organiser@example\.com/);
    });

    // TC-S1-86 · US-12 AC-3 · setup: base-users + tc-s1-22-setup + tc-s1-54-setup · fails if an unknown id behaved differently from a forbidden one
    // Code: a missing row and an out-of-scope row both give 404.
    it('denies an event that does not exist', async () => {
      await open('EVT-999').expect(404);
    });

    // TC-S1-86 · US-12 AC-3 · setup: base-users + tc-s1-22-setup + tc-s1-54-setup + tc-s1-84-setup · fails if any Coordinator could open a request before the Lead assigns it
    // Code: coordinatorId is NULL, so ASSIGNED scope never matches (Week 7 Change 5: it waits in the Lead's queue).
    it('hides an unassigned SUBMITTED request from every Coordinator', async () => {
      await given('tc-s1-84-setup');

      for (const who of ['coordinatorA', 'coordinatorB'] as const) {
        await open(EVENT.unassigned, who).expect(404);
      }
    });

    // TC-S1-86 · US-12 AC-3 · setup: base-users + tc-s1-22-setup + tc-s1-54-setup + tc-s1-84-setup · fails if a Coordinator could read an Organiser's unfinished draft
    // Code: a DRAFT has no Coordinator, so ASSIGNED scope never matches.
    it('never exposes an unassigned DRAFT', async () => {
      await given('tc-s1-84-setup');

      await open(EVENT.draft, 'coordinatorB').expect(404);
    });
  });

  describe('route resolution', () => {
    // TC-S1-84 · US-12 AC-1 · setup: base-users + tc-s1-22-setup + tc-s1-54-setup · fails if GET /events/assigned were routed to GET /events/assigned/:id
    // Code: @Get('assigned') is declared before @Get('assigned/:id') in EventsController.
    it('does not treat "assigned" as an event id', async () => {
      const res = await http().get('/events/assigned').set('Authorization', as('coordinatorA')).expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
