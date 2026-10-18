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
 * The code under test:
 *  - GET /events/:id/reassignment-candidates -> EventsService.getReassignmentCandidates():
 *    every EVENT_COORDINATOR except the caller, by name.
 *  - POST /events/:id/reassign -> EventsService.reassign(): only the event's
 *    current Coordinator may hand it on (assertCanRequestReassignment, 403
 *    otherwise), only at an assignable status (409 otherwise), and only to
 *    another user with the Coordinator role (assertIsCoordinator). In one
 *    transaction it updates coordinatorId and records a "coordinator" change
 *    in the event's history; after commit it notifies both Coordinators
 *    (EVENT_REASSIGNED). The status is left as it was.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql and tc-s2-83-setup.sql (an event in
 * planning, assigned to u-coordinator-a); some tests then load a further tc-s2
 * script, as their test case names (docs/testing/sprint2-test-cases.md).
 */
describe('Story 26 reassign an event to another Coordinator (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';

  /** Fixed users from base-users.sql. */
  const USERS = {
    cody: 'coord.a@example.com',
    casey: 'coord.b@example.com',
    organiser: 'organiser@example.com',
    venueStaff: 'venue.staff@example.com',
  } as const;
  const tokens: Record<string, string> = {};
  const CODY = 'u-coordinator-a';
  const CASEY = 'u-coordinator-b';

  /** Fixed events from tc-s2-83/84-setup.sql. */
  const EVENT = { planning: 'e-s2-reassign', finished: 'e-s2-finished' } as const;

  const as = (who: keyof typeof USERS) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  /** Hand the event to coordinatorId, as Cody (its Coordinator) by default. */
  const reassign = (coordinatorId: string, who: keyof typeof USERS = 'cody', eventId: string = EVENT.planning) =>
    http().post(`/events/${eventId}/reassign`).set('Authorization', as(who)).send({ coordinatorId });

  const candidates = (who: keyof typeof USERS = 'cody') =>
    http().get(`/events/${EVENT.planning}/reassignment-candidates`).set('Authorization', as(who));

  const stored = () => prisma.eventRequest.findUniqueOrThrow({ where: { id: EVENT.planning } });

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
    await given('base-users');
    for (const [key, email] of Object.entries(USERS)) {
      const res = await http().post('/auth/login').send({ email, password: PASSWORD }).expect(200);
      tokens[key] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    // Leave the testDB empty, so files not yet converted to resetDb (which
    // delete only the tables they know) never trip over rows this file made.
    await resetDb(prisma);
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await given('base-users', 'tc-s2-83-setup');
  });

  describe('AC-1: a new Coordinator can be selected', () => {
    // TC-S2-83 · US-26 AC-1 · setup: base-users + tc-s2-83-setup · fails if the choice left out a Coordinator, offered the requester, or offered a non-Coordinator
    // Code: getReassignmentCandidates() lists users with the EVENT_COORDINATOR
    // role except the caller; base-users has one of every other role, all left out.
    it('lists the other Coordinators only, not the requester', async () => {
      const res = await candidates().expect(200);

      expect(res.body).toEqual([{ id: CASEY, name: 'Casey Coordinator', email: 'coord.b@example.com' }]);
    });
  });

  describe('AC-1: only the responsible Coordinator, while the event is still active', () => {
    // TC-S2-84 · US-26 AC-1 · setup: base-users + tc-s2-83-setup · fails if a Coordinator not responsible for the event could hand it on
    // Code: assertCanRequestReassignment() loads the event at ANY scope, then
    // refuses anyone but its current Coordinator with an explicit 403.
    it('refuses a Coordinator who is not responsible for the event (403)', async () => {
      await candidates('casey').expect(403);
      await reassign(CASEY, 'casey').expect(403);
      expect((await stored()).coordinatorId).toBe(CODY);
    });

    // TC-S2-84 · US-26 AC-1 · setup: base-users + tc-s2-83-setup · fails if another role could reassign an event
    // Code: both routes are @Roles(EVENT_COORDINATOR), so RolesGuard answers 403.
    it.each(['organiser', 'venueStaff'] as const)('refuses %s (403)', async (who) => {
      await candidates(who).expect(403);
      await reassign(CASEY, who).expect(403);
    });

    // TC-S2-84 · US-26 AC-1 · setup: base-users + tc-s2-83-setup + tc-s2-84-setup · fails if a finished event could still be reassigned
    // Code: COMPLETED is not in ASSIGNABLE_STATUSES, so the service answers 409.
    it('refuses a finished event (409)', async () => {
      await given('tc-s2-84-setup');

      await reassign(CASEY, 'cody', EVENT.finished).expect(409);
    });
  });

  describe('AC-2: the assigned Coordinator is updated', () => {
    // TC-S2-85 · US-26 AC-2 · setup: base-users + tc-s2-83-setup · fails if confirming didn't change the event's Coordinator, or changed its status
    // Code: reassign() updates coordinatorId and returns the event with the new Coordinator; status is never touched.
    it('hands the event to the selected Coordinator', async () => {
      const res = await reassign(CASEY).expect(200);

      expect(res.body.coordinator).toEqual({ id: CASEY, name: 'Casey Coordinator', email: 'coord.b@example.com' });
      expect(await stored()).toMatchObject({ coordinatorId: CASEY, status: EventStatus.PLANNING });
    });

    // TC-S2-85 · US-26 AC-2 · setup: base-users + tc-s2-83-setup · fails if the event stayed with the previous Coordinator or never reached the new one
    // Code: "assigned" views are scoped by coordinatorId, so the event moves between the two queues.
    it("moves the event between the two Coordinators' queues", async () => {
      await reassign(CASEY).expect(200);

      await http().get(`/events/assigned/${EVENT.planning}`).set('Authorization', as('casey')).expect(200);
      await http().get(`/events/assigned/${EVENT.planning}`).set('Authorization', as('cody')).expect(404);
    });
  });

  describe('AC-2: only a valid new Coordinator can be selected', () => {
    // TC-S2-86 · US-26 AC-2 · setup: base-users + tc-s2-83-setup · fails if an event could be "reassigned" to its current Coordinator
    // Code: reassign() refuses the current coordinatorId with 400.
    it('rejects reassigning to yourself (400)', async () => {
      await reassign(CODY).expect(400);
    });

    // TC-S2-86 · US-26 AC-2 · setup: base-users + tc-s2-83-setup · fails if an event could be handed to someone who isn't a Coordinator
    // Code: assertIsCoordinator() refuses a user without the EVENT_COORDINATOR role with 400.
    it('rejects a user who is not a Coordinator (400)', async () => {
      await reassign('u-organiser').expect(400);
      expect((await stored()).coordinatorId).toBe(CODY);
    });

    // TC-S2-86 · US-26 AC-2 · setup: base-users + tc-s2-83-setup · fails if an event could be handed to a user that doesn't exist
    // Code: assertIsCoordinator() answers 404 when no user has that id.
    it('rejects an unknown user (404)', async () => {
      await reassign('u-does-not-exist').expect(404);
      expect((await stored()).coordinatorId).toBe(CODY);
    });

    // TC-S2-86 · US-26 AC-2 · setup: base-users + tc-s2-83-setup · fails if a reassignment without a chosen Coordinator went through
    // Code: AssignCoordinatorDto requires coordinatorId, so an empty body is 400.
    it('requires a coordinatorId (400)', async () => {
      await http().post(`/events/${EVENT.planning}/reassign`).set('Authorization', as('cody')).send({}).expect(400);
    });
  });

  describe('AC-3: both Coordinators are notified', () => {
    // TC-S2-87 · US-26 AC-3 · setup: base-users + tc-s2-83-setup · fails if the previous or the new Coordinator wasn't notified
    // Code: after the transaction commits, reassign() sends EVENT_REASSIGNED to both.
    it('notifies the previous and the new Coordinator', async () => {
      await reassign(CASEY).expect(200);

      const notes = await prisma.notification.findMany({
        where: { relatedEventId: EVENT.planning, type: NotificationType.EVENT_REASSIGNED },
      });
      expect(notes.map((n) => n.recipientId).sort()).toEqual([CODY, CASEY]);
    });

    // TC-S2-87 · US-26 AC-3 · setup: base-users + tc-s2-83-setup · fails if a refused reassignment still notified anyone
    // Code: the checks throw before anything is written or sent.
    it('notifies nobody when the reassignment is refused', async () => {
      await reassign(CASEY, 'casey').expect(403);

      expect(await prisma.notification.count()).toBe(0);
    });
  });

  describe("AC-4: the reassignment is in the event's change history", () => {
    // TC-S2-88 · US-26 AC-4 · setup: base-users + tc-s2-83-setup · fails if the reassignment left no history entry, or the entry didn't say who, from whom and to whom
    // Code: reassign() calls recordChange() with field "coordinator", previous and new names, in the same transaction.
    it('shows who handed it over, from whom, to whom', async () => {
      await reassign(CASEY).expect(200);

      // The new Coordinator can now read the history, including this entry.
      const res = await http().get(`/events/${EVENT.planning}/history`).set('Authorization', as('casey')).expect(200);

      expect(res.body.entries).toHaveLength(1);
      expect(res.body.entries[0]).toMatchObject({
        changes: [{ field: 'coordinator', previous: 'Cody Coordinator', next: 'Casey Coordinator' }],
        changedBy: { id: CODY, name: 'Cody Coordinator' },
        requiresReview: false,
      });
    });
  });
});
