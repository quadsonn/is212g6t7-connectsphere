import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, NotificationType, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-26 (Story 26) — a Coordinator whose availability changes has their event
 * reassigned to another Coordinator. Integration tests, one describe per AC.
 *
 * Since Week 7 Change 5 the Event Coordinator Lead makes the reassignment: the
 * Coordinator asks the Lead, who picks the new Coordinator and confirms. The
 * Coordinator's own reassign routes were removed (US-56). So these tests act as
 * the Lead; test/events-assignment.e2e-spec.ts covers the Lead's wider view.
 *
 * The code under test:
 *  - GET /assignments/coordinators -> EventsAssignmentService.listCoordinators():
 *    every EVENT_COORDINATOR, by name. The Lead's page leaves out the current one.
 *  - POST /assignments/events/:id/reassign -> EventsAssignmentService.reassign():
 *    Lead only (@Roles and EVENT/ASSIGN), only at an active status (409), only to
 *    a different user with the Coordinator role (400, or 404 if unknown). In one
 *    transaction it swaps coordinatorId and records the change (recordChange),
 *    then notifies the previous and new Coordinators (EVENT_REASSIGNED).
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql, tc-s1-25-setup.sql (the Lead) and
 * tc-s2-83-setup.sql (EVT-107 in planning, assigned to USR-004); TC-S2-84 also
 * loads tc-s2-84-setup.sql (docs/testing/sprint2-test-cases.md).
 */
describe('Story 26 have an event reassigned (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';

  /** Fixed users from base-users.sql and tc-s1-25-setup.sql. */
  const USERS = {
    lead: 'lead@example.com',
    coordinator: 'coord.a@example.com',
    otherCoordinator: 'coord.b@example.com',
    organiser: 'organiser@example.com',
    venueStaff: 'venue.staff@example.com',
    tech: 'tech.support@example.com',
    attendee: 'attendee@example.com',
  } as const;
  const ID = { coordinator: 'USR-004', otherCoordinator: 'USR-005', organiser: 'USR-006', lead: 'USR-012' } as const;
  const tokens: Record<string, string> = {};

  /** Fixed events from tc-s2-83/84-setup.sql. */
  const EVENT = { planning: 'EVT-107', finished: 'EVT-075' } as const;

  const as = (who: keyof typeof USERS) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  /** Reassign an event, as the Lead by default. */
  const reassign = (body: Record<string, unknown>, who: keyof typeof USERS = 'lead', eventId: string = EVENT.planning) =>
    http().post(`/assignments/events/${eventId}/reassign`).set('Authorization', as(who)).send(body);

  const coordinatorOf = async (eventId: string = EVENT.planning) =>
    (await prisma.eventRequest.findUniqueOrThrow({ where: { id: eventId } })).coordinatorId;

  const reassignedNotices = () =>
    prisma.notification.findMany({
      where: { type: NotificationType.EVENT_REASSIGNED },
      select: { recipientId: true, relatedEventId: true },
      orderBy: { recipientId: 'asc' },
    });

  /** Loads a test case's setup script(s) on top of the shared pre-condition. */
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
    await given('base-users', 'tc-s1-25-setup', 'tc-s2-83-setup');
  });

  describe('US-26 AC-1: a new Coordinator can be selected', () => {
    // TC-S2-83 · US-26 AC-1 · setup: base-users + tc-s1-25-setup + tc-s2-83-setup · fails if the Lead were offered someone who isn't a Coordinator, or missed one who is
    // Code: listCoordinators() selects users with role EVENT_COORDINATOR only, ordered by name.
    it('offers the Lead every Coordinator, and no one without the Coordinator role', async () => {
      const res = await http().get('/assignments/coordinators').set('Authorization', as('lead')).expect(200);

      expect(res.body).toEqual([
        { id: ID.otherCoordinator, name: 'Casey Coordinator', email: 'coord.b@example.com' },
        { id: ID.coordinator, name: 'Cody Coordinator', email: 'coord.a@example.com' },
      ]);
    });

    // TC-S2-83 · US-26 AC-1 · setup: base-users + tc-s1-25-setup + tc-s2-83-setup · fails if the Lead couldn't find the event under the Coordinator responsible for it
    // Code: listAssignments() groups each Coordinator's active events; ?coordinatorId= filters to one.
    it('shows the Lead the event under the Coordinator responsible for it', async () => {
      const res = await http()
        .get(`/assignments?coordinatorId=${ID.coordinator}`)
        .set('Authorization', as('lead'))
        .expect(200);

      expect(res.body).toEqual([
        expect.objectContaining({
          coordinator: expect.objectContaining({ id: ID.coordinator }),
          events: [expect.objectContaining({ id: EVENT.planning, status: EventStatus.PLANNING })],
        }),
      ]);
    });
  });

  describe('US-26 AC-1: who can reassign, and when', () => {
    // TC-S2-84 · US-26 AC-1 · setup: base-users + tc-s1-25-setup + tc-s2-83-setup · fails if the responsible Coordinator could still hand the event on without the Lead
    // Code: the Coordinator-side POST /events/:id/reassign was removed (404); /assignments is @Roles(EVENT_COORDINATOR_LEAD), so RolesGuard answers 403.
    it('refuses the responsible Coordinator, who now asks the Lead (403)', async () => {
      await http()
        .post(`/events/${EVENT.planning}/reassign`)
        .set('Authorization', as('coordinator'))
        .send({ coordinatorId: ID.otherCoordinator })
        .expect(404);
      await reassign({ coordinatorId: ID.otherCoordinator }, 'coordinator').expect(403);

      expect(await coordinatorOf()).toBe(ID.coordinator);
    });

    // TC-S2-84 · US-26 AC-1 · setup: base-users + tc-s1-25-setup + tc-s2-83-setup · fails if any role but the Lead could reassign an event
    // Code: RolesGuard on EventsAssignmentController answers 403 to every role but EVENT_COORDINATOR_LEAD.
    it.each(['otherCoordinator', 'organiser', 'venueStaff', 'tech', 'attendee'] as const)(
      'refuses %s (403)',
      async (who) => {
        await reassign({ coordinatorId: ID.otherCoordinator }, who).expect(403);

        expect(await coordinatorOf()).toBe(ID.coordinator);
      },
    );

    // TC-S2-84 · US-26 AC-1 · setup: base-users + tc-s1-25-setup + tc-s2-83-setup + tc-s2-84-setup · fails if a finished event could be handed on
    // Code: reassign() answers 409 when the status is outside ACTIVE_ASSIGNMENT_STATUSES.
    it('refuses a finished event (409)', async () => {
      await given('tc-s2-84-setup');

      await reassign({ coordinatorId: ID.otherCoordinator }, 'lead', EVENT.finished).expect(409);

      expect(await coordinatorOf(EVENT.finished)).toBe(ID.coordinator);
    });
  });

  describe('US-26 AC-2: confirming updates the assigned Coordinator', () => {
    // TC-S2-85 · US-26 AC-2 · setup: base-users + tc-s1-25-setup + tc-s2-83-setup · fails if confirming didn't make the new Coordinator the assigned one, or changed the status
    // Code: swapCoordinator() writes coordinatorId only; the status is untouched.
    it('hands the event to the selected Coordinator', async () => {
      const res = await reassign({ coordinatorId: ID.otherCoordinator }).expect(200);

      expect(res.body).toMatchObject({
        id: EVENT.planning,
        status: EventStatus.PLANNING,
        coordinator: { id: ID.otherCoordinator, name: 'Casey Coordinator' },
      });
      expect(await coordinatorOf()).toBe(ID.otherCoordinator);
    });

    // TC-S2-85 · US-26 AC-2 · setup: base-users + tc-s1-25-setup + tc-s2-83-setup · fails if the previous Coordinator kept the event, or the new one couldn't open it
    // Code: GET /events/assigned/:id is scoped to coordinatorId = the caller.
    it("moves the event between the two Coordinators' views", async () => {
      await reassign({ coordinatorId: ID.otherCoordinator }).expect(200);

      await http().get(`/events/assigned/${EVENT.planning}`).set('Authorization', as('otherCoordinator')).expect(200);
      await http().get(`/events/assigned/${EVENT.planning}`).set('Authorization', as('coordinator')).expect(404);
    });
  });

  describe('US-26 AC-2: only a valid, different Coordinator can be chosen', () => {
    // TC-S2-86 · US-26 AC-2 · setup: base-users + tc-s1-25-setup + tc-s2-83-setup · fails if the event could be "reassigned" to the Coordinator who already has it
    // Code: reassign() answers 400 when coordinatorId equals the current one.
    it('rejects the current Coordinator (400)', async () => {
      const res = await reassign({ coordinatorId: ID.coordinator }).expect(400);

      expect(res.body.message).toContain('choose a different coordinator');
    });

    // TC-S2-86 · US-26 AC-2 · setup: base-users + tc-s1-25-setup + tc-s2-83-setup · fails if the event could be handed to someone without the Coordinator role
    // Code: assertIsCoordinator() answers 400 for any other role.
    it('rejects a user who is not a Coordinator (400)', async () => {
      await reassign({ coordinatorId: ID.organiser }).expect(400);

      expect(await coordinatorOf()).toBe(ID.coordinator);
    });

    // TC-S2-86 · US-26 AC-2 · setup: base-users + tc-s1-25-setup + tc-s2-83-setup · fails if an unknown id were accepted
    // Code: assertIsCoordinator() answers 404 when no user has the id.
    it('rejects an unknown user (404)', async () => {
      await reassign({ coordinatorId: 'USR-999' }).expect(404);

      expect(await coordinatorOf()).toBe(ID.coordinator);
    });

    // TC-S2-86 · US-26 AC-2 · setup: base-users + tc-s1-25-setup + tc-s2-83-setup · fails if a reassignment with no Coordinator chosen got past validation
    // Code: AssignCoordinatorDto (@IsNotEmpty coordinatorId) answers 400.
    it('requires a coordinatorId (400)', async () => {
      await reassign({}).expect(400);

      expect(await coordinatorOf()).toBe(ID.coordinator);
    });
  });

  describe('US-26 AC-3: both Coordinators are notified', () => {
    // TC-S2-87 · US-26 AC-3 · setup: base-users + tc-s1-25-setup + tc-s2-83-setup · fails if the previous or the new Coordinator wasn't told
    // Code: reassign() sends one EVENT_REASSIGNED notification to each.
    it('notifies the previous and the new Coordinator', async () => {
      await reassign({ coordinatorId: ID.otherCoordinator }).expect(200);

      expect(await reassignedNotices()).toEqual([
        { recipientId: ID.coordinator, relatedEventId: EVENT.planning },
        { recipientId: ID.otherCoordinator, relatedEventId: EVENT.planning },
      ]);
    });

    // TC-S2-87 · US-26 AC-3 · setup: base-users + tc-s1-25-setup + tc-s2-83-setup · fails if a refused reassignment still sent notices
    // Code: the notices go out only after the swap commits.
    it('notifies nobody when the reassignment is refused', async () => {
      await reassign({ coordinatorId: ID.otherCoordinator }, 'coordinator').expect(403);
      await reassign({ coordinatorId: ID.coordinator }).expect(400);

      expect(await reassignedNotices()).toEqual([]);
    });
  });

  describe('US-26 AC-4: recorded in the change history', () => {
    // TC-S2-88 · US-26 AC-4 · setup: base-users + tc-s1-25-setup + tc-s2-83-setup · fails if the history didn't show the handover, who made it, or the before and after
    // Code: reassign() calls recordChange() with { field: 'coordinator', previous, next } in the same transaction.
    it('shows who handed it over, from whom, to whom', async () => {
      await reassign({ coordinatorId: ID.otherCoordinator }).expect(200);

      const res = await http().get(`/events/${EVENT.planning}/history`).set('Authorization', as('otherCoordinator')).expect(200);

      expect(res.body.entries).toEqual([
        expect.objectContaining({
          changes: [{ field: 'coordinator', previous: 'Cody Coordinator', next: 'Casey Coordinator' }],
          changedBy: expect.objectContaining({ id: ID.lead, name: 'Leah Lead' }),
        }),
      ]);
    });
  });
});
