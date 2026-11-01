import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-10 (Be assigned as main point of contact for an event), integration
 * tests: the real Nest app over HTTP (Supertest) and the local test database,
 * one describe per acceptance criterion.
 *
 * Since Week 7 Change 5 the Event Coordinator Lead makes the assignment
 * (US-55 assigns from the unassigned queue, US-56 reassigns); Coordinators no
 * longer assign themselves. This file checks US-10's three outcomes through
 * those endpoints; the Lead's own stories are tested in
 * test/events-assignment.e2e-spec.ts.
 *
 * Code under test: POST /assignments/queue/:id/assign and
 * POST /assignments/events/:id/reassign (@Roles EVENT_COORDINATOR_LEAD) ->
 * EventsAssignmentService, which sets coordinatorId only; the event views
 * resolve the coordinator relation (id, name, email) for every role allowed
 * to see the event, including the Attendee's public projection.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql + tc-s1-25-setup.sql (the Lead) +
 * tc-s1-84-setup.sql (EVT-164, SUBMITTED and unassigned).
 */
describe('US-10 the assigned Coordinator is the main point of contact (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const USERS = {
    organiser: 'organiser@example.com',
    coordinatorA: 'coord.a@example.com',
    coordinatorB: 'coord.b@example.com',
    lead: 'lead@example.com',
    attendee: 'attendee@example.com',
  } as const;
  type Who = keyof typeof USERS;
  const CODY = { id: 'USR-004', name: 'Cody Coordinator', email: 'coord.a@example.com' };
  const CASEY = { id: 'USR-005', name: 'Casey Coordinator', email: 'coord.b@example.com' };
  const QUEUED = 'EVT-164';

  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: Who) => `Bearer ${tokens[who]}`;
  const assign = (id: string, coordinatorId: string) =>
    http().post(`/assignments/queue/${id}/assign`).set('Authorization', as('lead')).send({ coordinatorId });
  const reassign = (id: string, coordinatorId: string) =>
    http().post(`/assignments/events/${id}/reassign`).set('Authorization', as('lead')).send({ coordinatorId });
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
    await given('base-users', 'tc-s1-25-setup');
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
    await given('base-users', 'tc-s1-25-setup', 'tc-s1-84-setup');
  });

  describe('AC-1: a Coordinator is linked to a submitted event as main contact', () => {
    // TC-S1-90 · US-10 AC-1 · setup: base-users + tc-s1-25-setup + tc-s1-84-setup · fails if assigning did not make that Coordinator the event's contact and owner
    // Code: EventsAssignmentService.assign() sets coordinatorId; the Coordinator's ASSIGNED scope then includes the event.
    it('links the Coordinator to the submitted request, and it appears in their list', async () => {
      await assign(QUEUED, CODY.id).expect(200);

      const stored = await prisma.eventRequest.findUniqueOrThrow({ where: { id: QUEUED } });
      expect(stored.coordinatorId).toBe(CODY.id);
      const list = await http().get('/events/assigned').set('Authorization', as('coordinatorA')).expect(200);
      expect(list.body.map((e: { id: string }) => e.id)).toContain(QUEUED);
    });

    // TC-S1-90 · US-10 AC-1, US-11 · setup: base-users + tc-s1-25-setup + tc-s1-84-setup · fails if becoming the contact changed the request's status
    // Code: assign() writes coordinatorId only; it never calls setStatus().
    it('leaves the request’s status as it was', async () => {
      await assign(QUEUED, CODY.id).expect(200);

      expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: QUEUED } })).status).toBe(EventStatus.SUBMITTED);
    });

    // TC-S1-90 · US-10 AC-1 · setup: base-users + tc-s1-25-setup + tc-s1-84-setup · fails if a non-Coordinator could be made an event's contact
    // Code: assign() checks the target user's role is EVENT_COORDINATOR (400 otherwise).
    it('refuses to make a non-Coordinator the contact', async () => {
      await assign(QUEUED, 'USR-001').expect(400);

      expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: QUEUED } })).coordinatorId).toBeNull();
    });
  });

  describe('AC-2: the event can be reassigned when availability changes', () => {
    // TC-S1-91 · US-10 AC-2 · setup: base-users + tc-s1-25-setup + tc-s1-84-setup · fails if reassigning left the old Coordinator in charge, or the new one without access
    // Code: EventsAssignmentService.reassign() replaces coordinatorId; ASSIGNED scope follows it.
    it('hands the event to another Coordinator: the new one gains it, the old one loses it', async () => {
      await assign(QUEUED, CODY.id).expect(200);

      await reassign(QUEUED, CASEY.id).expect(200);

      await http().get(`/events/assigned/${QUEUED}`).set('Authorization', as('coordinatorB')).expect(200);
      await http().get(`/events/assigned/${QUEUED}`).set('Authorization', as('coordinatorA')).expect(404);
    });

    // TC-S1-91 · US-10 AC-2 · setup: base-users + tc-s1-25-setup + tc-s1-84-setup · fails if a Coordinator could reassign an event themselves
    // Code: the /assignments routes are @Roles(EVENT_COORDINATOR_LEAD) (Week 7 Change 5).
    it('is the Lead’s action: a Coordinator cannot reassign', async () => {
      await assign(QUEUED, CODY.id).expect(200);

      await http()
        .post(`/assignments/events/${QUEUED}/reassign`)
        .set('Authorization', as('coordinatorA'))
        .send({ coordinatorId: CASEY.id })
        .expect(403);
      expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: QUEUED } })).coordinatorId).toBe(CODY.id);
    });
  });

  describe('AC-3: the assigned Coordinator is visible to every authorised viewer', () => {
    // TC-S1-92 · US-10 AC-3 · setup: base-users + tc-s1-25-setup + tc-s1-84-setup · fails if the Organiser could not see who their contact is
    // Code: the Organiser's view (GET /events/mine/:id) resolves the coordinator relation (id, name, email).
    it('shows the Coordinator to the Organiser who raised the request', async () => {
      await assign(QUEUED, CODY.id).expect(200);

      const res = await http().get(`/events/mine/${QUEUED}`).set('Authorization', as('organiser')).expect(200);

      expect(res.body.coordinator).toEqual(CODY);
    });

    // TC-S1-92 · US-10 AC-3 · setup: base-users + tc-s1-25-setup + tc-s1-84-setup · fails if the Organiser's view still named the old contact after a reassignment
    // Code: the coordinator relation is read on every request, never cached.
    it('shows the new contact after a reassignment', async () => {
      await assign(QUEUED, CODY.id).expect(200);
      await reassign(QUEUED, CASEY.id).expect(200);

      const res = await http().get(`/events/mine/${QUEUED}`).set('Authorization', as('organiser')).expect(200);

      expect(res.body.coordinator).toEqual(CASEY);
    });

    // TC-S1-92 · US-10 AC-3 · setup: base-users + tc-s1-25-setup + tc-s1-84-setup · fails if the assigned Coordinator's own view did not name them
    // Code: GET /events/:id for the assigned Coordinator includes the coordinator relation.
    it('shows the Coordinator in their own view of the event', async () => {
      await assign(QUEUED, CODY.id).expect(200);

      const res = await http().get(`/events/${QUEUED}`).set('Authorization', as('coordinatorA')).expect(200);

      expect(res.body.coordinator).toEqual(CODY);
    });

    // TC-S1-92 · US-10 AC-3, US-02 AC-7 · setup: base-users + tc-s1-25-setup + tc-s1-84-setup + tc-s1-22-setup + tc-s1-67-setup · fails if an Attendee viewing a public event could not see its contact
    // Code: the Attendee's public projection (projectEvent) keeps coordinator while dropping planning fields.
    it('shows the Coordinator to an Attendee viewing a public event', async () => {
      await given('tc-s1-22-setup', 'tc-s1-67-setup');

      const res = await http().get('/events/EVT-160').set('Authorization', as('attendee')).expect(200);

      expect(res.body.coordinator).toEqual(CODY);
    });

    // TC-S1-92 · US-10 AC-3 · setup: base-users + tc-s1-25-setup + tc-s1-84-setup · fails if an unassigned request showed a made-up contact
    // Code: coordinator is null until assigned.
    it('reports no contact until one is assigned', async () => {
      const res = await http().get(`/events/mine/${QUEUED}`).set('Authorization', as('organiser')).expect(200);

      expect(res.body.coordinator).toBeNull();
    });
  });
});
