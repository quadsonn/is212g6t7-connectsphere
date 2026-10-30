import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, PrismaClient, Role } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-02 (Role-appropriate access restriction), integration tests: the real
 * Nest app over HTTP (Supertest) and the local test database, one describe
 * per acceptance criterion. Every check goes through HTTP, which is the point
 * of AC-3: the server enforces, not the UI.
 *
 * Code under test: the permission matrix (src/common/access/permission-matrix.ts,
 * role × resource × action → scope), RolesGuard with @RequirePermission or
 * @Roles on each route (default-deny), AccessControlService
 * (OWN / ASSIGNED / RELATED / PUBLIC scopes on event reads, and the Attendee
 * projection), JwtAuthGuard and UnauthorizedFilter for AC-8.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql + tc-s1-22-setup.sql + tc-s1-67-setup.sql.
 */
describe('US-02 role-based and ownership access control (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';

  /** base-users.sql, plus the second Organiser from tc-s1-22-setup.sql. */
  const USERS = {
    organiser: 'organiser@example.com',
    otherOrganiser: 'other@example.com',
    coordinator: 'coord.a@example.com',
    otherCoordinator: 'coord.b@example.com',
    venueStaff: 'venue.staff@example.com',
    attendee: 'attendee@example.com',
  } as const;
  type Who = keyof typeof USERS;

  /** tc-s1-67-setup.sql. */
  const EVENT = { ownedByA: 'EVT-160', ownedByB: 'EVT-161', draft: 'EVT-162' } as const;

  const tokens: Record<string, string> = {};
  const as = (who: Who) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const names = (body: { name: string }[]) => body.map((e) => e.name);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');

    prisma = new PrismaClient();

    // Log each user in once. JWTs are stateless and the users come back with
    // the same IDs after every reset, so the tokens stay valid; a revoked one
    // (AC-8) is un-revoked by the next reset, which empties RevokedToken.
    await resetDb(prisma);
    await loadSql(prisma, 'base-users');
    await loadSql(prisma, 'tc-s1-22-setup');
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
    for (const script of ['base-users', 'tc-s1-22-setup', 'tc-s1-67-setup']) {
      await loadSql(prisma, script);
    }
  });

  describe('AC-1: default-deny for undeclared actions', () => {
    // TC-S1-67 · US-02 AC-1 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if a route with no declared permission answered any role
    // Code: GET /events/:id/internal-notes declares no @Roles/@RequirePermission, so RolesGuard's default-deny answers 403.
    it('denies a route that declares no permission, for every role', async () => {
      for (const who of ['organiser', 'coordinator', 'venueStaff', 'attendee'] as const) {
        const res = await http()
          .get(`/events/${EVENT.ownedByA}/internal-notes`)
          .set('Authorization', as(who))
          .expect(403);

        expect(res.body.shouldNeverBeReturned).toBeUndefined();
      }
    });

    // TC-S1-67 · US-02 AC-1 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if a denied request changed any data
    // Code: the guard rejects before the controller runs, so no service code executes.
    it('changes nothing when denied', async () => {
      const before = await prisma.eventRequest.findMany({ orderBy: { id: 'asc' } });
      await http()
        .get(`/events/${EVENT.ownedByA}/internal-notes`)
        .set('Authorization', as('attendee'))
        .expect(403);

      expect(await prisma.eventRequest.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
    });

    // TC-S1-67 · US-02 AC-1 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if Venue Staff could create an event request, or one was saved
    // Code: POST /events/drafts is @Roles(EVENT_ORGANISER); Venue Staff hold only EVENT/READ (RELATED) in the matrix.
    it('denies an event action the role has no grant for', async () => {
      await http()
        .post('/events/drafts')
        .set('Authorization', as('venueStaff'))
        .send({ name: 'Not allowed' })
        .expect(403);

      expect(await prisma.eventRequest.count({ where: { name: 'Not allowed' } })).toBe(0);
    });
  });

  describe('AC-2: granted actions succeed', () => {
    // TC-S1-68 · US-02 AC-2 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if a role with EVENT/READ could not list events
    // Code: each role's EVENT/READ grant lets GET /events through; the scope then filters the rows.
    it.each(['organiser', 'coordinator', 'attendee'] as const)('lets %s list events', async (who) => {
      await http().get('/events').set('Authorization', as(who)).expect(200);
    });

    // TC-S1-68 · US-02 AC-2 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if a granted write was refused or not saved
    // Code: the Organiser's EVENT/CREATE grant lets POST /events/drafts through; the draft is saved as theirs.
    it('lets an Organiser carry out a granted write (save a draft)', async () => {
      const res = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({ name: 'Allowed draft' })
        .expect(201);

      const saved = await prisma.eventRequest.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(saved).toMatchObject({ organiserId: 'USR-006', status: EventStatus.DRAFT });
    });
  });

  describe('AC-3: the server rejects, not the UI', () => {
    // TC-S1-69 · US-02 AC-3 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if a direct API call by an ungranted role went through
    // Code: PATCH /events/:id is @Roles(EVENT_ORGANISER), so Venue Staff get 403 however the request is made.
    it('rejects a direct URL call for an ungranted role', async () => {
      const res = await http()
        .patch(`/events/${EVENT.ownedByA}`)
        .set('Authorization', as('venueStaff'))
        .send({ name: 'Hijacked' })
        .expect(403);

      expect(res.body.name).toBeUndefined();
      expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: EVENT.ownedByA } })).name).toBe('Event owned by A');
    });

    // TC-S1-69 · US-02 AC-3 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if Venue Staff could open an event unrelated to their venues
    // Code: Venue Staff's EVENT/READ is RELATED scope (events booked at their venues); no booking, so 404.
    it('hides an event with no booking from Venue Staff (RELATED scope)', async () => {
      const res = await http()
        .get(`/events/${EVENT.ownedByA}`)
        .set('Authorization', as('venueStaff'))
        .expect(404);

      expect(res.body.name).toBeUndefined();
    });

    // TC-S1-69 · US-02 AC-3 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if an Organiser could open another Organiser's event by typing its id
    // Code: AccessControlService.assertEventAccess() applies OWN scope in the query, so another's event is "not found".
    it('rejects a direct call for another organiser’s event', async () => {
      const res = await http()
        .get(`/events/${EVENT.ownedByB}`)
        .set('Authorization', as('organiser'))
        .expect(404);

      expect(res.body.name).toBeUndefined();
    });

    // TC-S1-69 · US-02 AC-3 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if a denial carried any of the event's data
    // Code: the 403 is Nest's error envelope only (statusCode, message); nothing from the event.
    it('returns no payload alongside a denial', async () => {
      const res = await http()
        .get(`/events/${EVENT.ownedByA}/internal-notes`)
        .set('Authorization', as('attendee'))
        .expect(403);

      expect(Object.keys(res.body)).toEqual(expect.arrayContaining(['statusCode', 'message']));
      expect(res.body).not.toHaveProperty('layoutNotes');
    });
  });

  describe('AC-4: the client is told what its role may do', () => {
    // TC-S1-70 · US-02 AC-4 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if an Attendee's own grants were not reported
    // Code: GET /auth/me/permissions returns permittedActionsFor(role) from the same matrix the guards use.
    it('reports an Attendee’s permitted actions', async () => {
      const res = await http().get('/auth/me/permissions').set('Authorization', as('attendee')).expect(200);

      expect(res.body.role).toBe(Role.ATTENDEE);
      expect(res.body.permissions).toContainEqual({ resource: 'REGISTRATION', action: 'REGISTER', scope: 'OWN' });
    });

    // TC-S1-70 · US-02 AC-4 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if a role was told it may do something it may not
    // Code: permittedActionsFor() lists only the role's rows; an Attendee has no BOOKING row.
    it('does not advertise actions the role lacks', async () => {
      const res = await http().get('/auth/me/permissions').set('Authorization', as('attendee')).expect(200);

      const resources = res.body.permissions.map((p: { resource: string }) => p.resource);
      expect(resources).not.toContain('BOOKING');
    });

    // TC-S1-70 · US-02 AC-4 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if every role were told the same thing
    // Code: the matrix has different rows per role.
    it('differs per role', async () => {
      const organiser = await http().get('/auth/me/permissions').set('Authorization', as('organiser')).expect(200);
      const staff = await http().get('/auth/me/permissions').set('Authorization', as('venueStaff')).expect(200);

      expect(organiser.body.permissions).not.toEqual(staff.body.permissions);
    });

    // TC-S1-70 · US-02 AC-4 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if the advertised scope and the enforced one disagreed
    // Code: the RELATED scope reported for Venue Staff is the filter AccessControlService applies to GET /events.
    it('matches what the server actually enforces', async () => {
      const staff = await http().get('/auth/me/permissions').set('Authorization', as('venueStaff')).expect(200);

      const eventRead = staff.body.permissions.find(
        (p: { resource: string; action: string }) => p.resource === 'EVENT' && p.action === 'READ',
      );
      expect(eventRead.scope).toBe('RELATED');

      // None of the events has a booking at a venue this member manages.
      const res = await http().get('/events').set('Authorization', as('venueStaff')).expect(200);
      expect(res.body).toEqual([]);
    });

    // TC-S1-70 · US-02 AC-4 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if the permission list were readable without signing in
    // Code: GET /auth/me/permissions is behind JwtAuthGuard.
    it('requires authentication', async () => {
      await http().get('/auth/me/permissions').expect(401);
    });
  });

  describe('AC-5: an Organiser sees only their own requests', () => {
    // TC-S1-71 · US-02 AC-5 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if another Organiser's request appeared in the list
    // Code: scopedEventFilter() adds organiserId = caller for OWN scope.
    it('lists only their own', async () => {
      const res = await http().get('/events').set('Authorization', as('organiser')).expect(200);

      expect(names(res.body)).toEqual(expect.arrayContaining(['Event owned by A', 'Unreviewed draft']));
      expect(names(res.body)).not.toContain('Event owned by B');
    });

    // TC-S1-71 · US-02 AC-5 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if another Organiser's request opened by id
    // Code: assertEventAccess() finds no row under OWN scope and answers 404 (existence not revealed).
    it('denies another organiser’s event by id', async () => {
      await http().get(`/events/${EVENT.ownedByB}`).set('Authorization', as('organiser')).expect(404);
    });

    // TC-S1-71 · US-02 AC-5 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if an Organiser could not open their own request
    // Code: the same OWN-scoped lookup finds the caller's own event.
    it('allows their own event by id', async () => {
      const res = await http().get(`/events/${EVENT.ownedByA}`).set('Authorization', as('organiser')).expect(200);

      expect(res.body.name).toBe('Event owned by A');
    });
  });

  describe('AC-6: a Coordinator sees only assigned events', () => {
    // TC-S1-72 · US-02 AC-6 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if a Coordinator saw events assigned to someone else
    // Code: ASSIGNED scope adds coordinatorId = caller to the query.
    it('lists only events assigned to them', async () => {
      const res = await http().get('/events').set('Authorization', as('coordinator')).expect(200);

      expect(names(res.body)).toEqual(['Event owned by A']);
    });

    // TC-S1-72 · US-02 AC-6 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if another Coordinator's event opened by id
    // Code: assertEventAccess() under ASSIGNED scope finds nothing, so 404.
    it('denies an event assigned to another coordinator', async () => {
      await http().get(`/events/${EVENT.ownedByB}`).set('Authorization', as('coordinator')).expect(404);
    });

    // TC-S1-72 · US-02 AC-6 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if a Coordinator could open an event nobody is assigned to
    // Code: coordinatorId is NULL, so it never matches the caller (unassigned requests belong to the Lead's queue).
    it('denies an event with no coordinator assigned', async () => {
      await http().get(`/events/${EVENT.draft}`).set('Authorization', as('coordinator')).expect(404);
    });
  });

  describe('AC-7: an Attendee sees only registration-facing info', () => {
    // TC-S1-73 · US-02 AC-7 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if an Attendee received internal planning information
    // Code: AccessControlService.projectEvent() returns the public projection (no notes, needs or attendance) for PUBLIC scope.
    it('omits internal planning fields', async () => {
      const res = await http().get(`/events/${EVENT.ownedByA}`).set('Authorization', as('attendee')).expect(200);

      for (const field of ['layoutNotes', 'accessibilityNotes', 'accessibilityRequirements', 'equipmentNeeds', 'expectedAttendance', 'organiserId']) {
        expect(res.body).not.toHaveProperty(field);
      }
      expect(JSON.stringify(res.body)).not.toMatch(/INTERNAL/);
    });

    // TC-S1-73 · US-02 AC-7 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if the projection removed what registering needs
    // Code: the public projection keeps the name and registration fields.
    it('keeps what registration needs', async () => {
      const res = await http().get(`/events/${EVENT.ownedByA}`).set('Authorization', as('attendee')).expect(200);

      expect(res.body).toMatchObject({ name: 'Event owned by A', registrationEnabled: true });
    });

    // TC-S1-73 · US-02 AC-7 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if an Attendee could see a request still in planning
    // Code: the PUBLIC filter lists only CONFIRMED events open for registration.
    it('hides events that have not passed review', async () => {
      const res = await http().get('/events').set('Authorization', as('attendee')).expect(200);

      expect(names(res.body)).not.toContain('Unreviewed draft');
    });

    // TC-S1-73 · US-02 AC-7 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if a confirmed, open event were hidden from Attendees
    // Code: PUBLIC scope is not tied to an owner, so both Organisers' confirmed events are listed.
    it('lists confirmed events that are open for registration', async () => {
      const res = await http().get('/events').set('Authorization', as('attendee')).expect(200);

      expect(names(res.body)).toEqual(expect.arrayContaining(['Event owned by A', 'Event owned by B']));
    });

    // TC-S1-73 · US-02 AC-7 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if the list view leaked internal planning text
    // Code: the list goes through the same public projection as the single view.
    it('strips internal fields from the list view too', async () => {
      const res = await http().get('/events').set('Authorization', as('attendee')).expect(200);

      expect(res.body.length).toBeGreaterThan(0);
      expect(JSON.stringify(res.body)).not.toMatch(/INTERNAL/);
    });
  });

  describe('AC-8: unauthenticated requests are denied and pointed at login', () => {
    // TC-S1-74 · US-02 AC-8 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if an unauthenticated request was answered, or not pointed at login
    // Code: JwtAuthGuard answers 401; UnauthorizedFilter adds WWW-Authenticate and loginUrl (the frontend redirects on it).
    it('denies a protected route with no token', async () => {
      const res = await http().get('/events').expect(401);

      expect(res.body.loginUrl).toBe('/auth/login');
      expect(res.headers['www-authenticate']).toMatch(/Bearer/);
    });

    // TC-S1-74 · US-02 AC-8 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if a single event's data came back without a token
    // Code: the same guard protects GET /events/:id.
    it('denies a single event with no token', async () => {
      const res = await http().get(`/events/${EVENT.ownedByA}`).expect(401);

      expect(res.body.name).toBeUndefined();
    });

    // TC-S1-74 · US-02 AC-8 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if a forged token counted as signed in
    // Code: JwtStrategy cannot verify "not-a-real-token", so 401.
    it('denies a forged token', async () => {
      await http().get('/events').set('Authorization', 'Bearer not-a-real-token').expect(401);
    });

    // TC-S1-74 · US-02 AC-8 · setup: base-users + tc-s1-22-setup + tc-s1-67-setup · fails if a logged-out token still opened protected data
    // Code: logout stores the jti in RevokedToken; JwtStrategy refuses it from then on.
    it('denies once the session has been logged out', async () => {
      await http().post('/auth/logout').set('Authorization', as('organiser')).expect(204);

      await http().get('/events').set('Authorization', as('organiser')).expect(401);
    });
  });
});
