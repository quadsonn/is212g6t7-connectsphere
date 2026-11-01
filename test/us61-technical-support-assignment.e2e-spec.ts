import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { NO_TECH_SUPPORT_AVAILABLE_MESSAGE } from '../src/events/technical-support.rules';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-61 e2e — the assigned Event Coordinator assigns an available Technical
 * Support member to an event requiring on-site support.
 *
 * Code under test: EventsTechnicalSupportService (getAssignment, assign, unassign),
 * technical-support.rules (availability and overlap), and
 * TechnicalSupportAssignmentsService.findMine (the assignee's own list).
 *
 * Pre-condition for every test: reset the testDB, then run
 * tc-s4-76-setup.sql (Olga, Carla the event's Coordinator, Colin, Lena the
 * Lead, and Wei and Nadia, the only two Technical Support members).
 * base-users.sql is not loaded: its Technical Support member would join every
 * staff list. Events come from tc-s4-76b (the "Town Hall", EVT-304) onwards.
 */
describe('US-61 assign Technical Support Staff to an event (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  /** Fixed users from tc-s4-76-setup. */
  const ids: Record<string, string> = {
    organiser: 'USR-038',
    coordinator: 'USR-039',
    otherCoordinator: 'USR-040',
    lead: 'USR-041',
    wei: 'USR-042',
    nadia: 'USR-043',
  };
  const LOGINS: Record<string, string> = {
    organiser: 'olga.organiser@example.com',
    coordinator: 'carla@example.com',
    otherCoordinator: 'coordinator2@example.com',
    lead: 'lena.lead@example.com',
    wei: 'wei.t@example.com',
    nadia: 'nadia.t@example.com',
  };
  /** tc-s4-76b-setup: the event under test. */
  const townHall = { id: 'EVT-304' };

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const at = (time: string, day = '2030-10-01') => new Date(`${day}T${time}:00Z`);
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  const getAssignment = (eventId: string, who = 'coordinator') =>
    http().get(`/events/${eventId}/technical-support`).set('Authorization', as(who));
  const assign = (eventId: string, staffId: string, who = 'coordinator') =>
    http()
      .put(`/events/${eventId}/technical-support`)
      .set('Authorization', as(who))
      .send({ staffId });
  const assigneeOf = async (eventId: string) =>
    (await prisma.eventRequest.findUniqueOrThrow({ where: { id: eventId } })).technicalSupportId;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    prisma = new PrismaClient();

    // Users keep their fixed IDs after every reset, so these tokens stay valid.
    await resetDb(prisma);
    await given('tc-s4-76-setup');
    for (const [key, email] of Object.entries(LOGINS)) {
      const res = await http().post('/auth/login').send({ email, password: PASSWORD }).expect(200);
      tokens[key] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await given('tc-s4-76-setup');
  });

  describe('AC-1: an available member is recorded as assigned', () => {
    // TC-S4-76 · US-61 AC-1 · setup: tc-s4-76-setup + tc-s4-76b-setup · fails if an available Technical Support member cannot be assigned and recorded, the change is not in the history, or someone who is not Technical Support, or an event that needs no support, can be assigned
    // Code: EventsTechnicalSupportService.getAssignment / assign / unassign; technical-support.rules (requiresTechnicalSupport)
    it('US-61 AC-1: assign succeeds and records the member against the event', async () => {
      await given('tc-s4-76b-setup');
      const event = townHall;

      const res = await assign(event.id, ids.wei).expect(200);

      expect(res.body.assignee).toMatchObject({ id: ids.wei, name: 'Wei Technical' });
      expect(await assigneeOf(event.id)).toBe(ids.wei);
    });

    // TC-S4-76 · US-61 AC-1 · setup: tc-s4-76-setup + tc-s4-76b-setup · fails if an available Technical Support member cannot be assigned and recorded, the change is not in the history, or someone who is not Technical Support, or an event that needs no support, can be assigned
    // Code: EventsTechnicalSupportService.getAssignment / assign / unassign; technical-support.rules (requiresTechnicalSupport)
    it('US-61 AC-1: the assignment goes into the event history with who made it', async () => {
      await given('tc-s4-76b-setup');
      const event = townHall;

      await assign(event.id, ids.wei).expect(200);

      const history = await prisma.eventChange.findMany({ where: { eventId: event.id } });
      expect(history).toHaveLength(1);
      expect(history[0].changedById).toBe(ids.coordinator);
      expect(history[0].changes).toEqual([
        { field: 'technicalSupport', previous: null, next: 'Wei Technical' },
      ]);
    });

    // TC-S4-76 · US-61 AC-1 · setup: tc-s4-76-setup + tc-s4-76b-setup · fails if an available Technical Support member cannot be assigned and recorded, the change is not in the history, or someone who is not Technical Support, or an event that needs no support, can be assigned
    // Code: EventsTechnicalSupportService.getAssignment / assign / unassign; technical-support.rules (requiresTechnicalSupport)
    it('US-61 AC-1: the screen lists every member as available when nobody is busy', async () => {
      await given('tc-s4-76b-setup');
      const event = townHall;

      const res = await getAssignment(event.id).expect(200);

      expect(res.body).toMatchObject({
        requiresTechnicalSupport: true,
        assignable: true,
        assignee: null,
        noneAvailable: false,
        message: null,
      });
      expect(res.body.staff.map((s: { id: string; available: boolean }) => [s.id, s.available])).toEqual([
        [ids.nadia, true],
        [ids.wei, true],
      ]);
    });

    // TC-S4-76 · US-61 AC-1 · setup: tc-s4-76-setup + tc-s4-76b-setup + tc-s4-76c-setup · fails if an available Technical Support member cannot be assigned and recorded, the change is not in the history, or someone who is not Technical Support, or an event that needs no support, can be assigned
    // Code: EventsTechnicalSupportService.getAssignment / assign / unassign; technical-support.rules (requiresTechnicalSupport)
    it('US-61 AC-1: the Coordinator can change the assignment, and the change is recorded', async () => {
      await given('tc-s4-76b-setup', 'tc-s4-76c-setup'); // Wei already assigned
      const event = townHall;

      await assign(event.id, ids.nadia).expect(200);

      expect(await assigneeOf(event.id)).toBe(ids.nadia);
      const [entry] = await prisma.eventChange.findMany({ where: { eventId: event.id } });
      expect(entry.changes).toEqual([
        { field: 'technicalSupport', previous: 'Wei Technical', next: 'Nadia Technical' },
      ]);
    });

    // TC-S4-76 · US-61 AC-1 · setup: tc-s4-76-setup + tc-s4-76b-setup + tc-s4-76c-setup · fails if an available Technical Support member cannot be assigned and recorded, the change is not in the history, or someone who is not Technical Support, or an event that needs no support, can be assigned
    // Code: EventsTechnicalSupportService.getAssignment / assign / unassign; technical-support.rules (requiresTechnicalSupport)
    it('US-61 AC-1: the Coordinator can remove the assignment', async () => {
      await given('tc-s4-76b-setup', 'tc-s4-76c-setup'); // Wei already assigned
      const event = townHall;

      const res = await http()
        .delete(`/events/${event.id}/technical-support`)
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(res.body.assignee).toBeNull();
      expect(await assigneeOf(event.id)).toBeNull();
    });

    // TC-S4-76 · US-61 AC-1 · setup: tc-s4-76-setup + tc-s4-76d-setup · fails if an available Technical Support member cannot be assigned and recorded, the change is not in the history, or someone who is not Technical Support, or an event that needs no support, can be assigned
    // Code: EventsTechnicalSupportService.getAssignment / assign / unassign; technical-support.rules (requiresTechnicalSupport)
    it('US-61 AC-1: an event not marked as requiring technical support cannot be assigned', async () => {
      await given('tc-s4-76d-setup');
      const event = { id: 'EVT-305' };

      const res = await assign(event.id, ids.wei).expect(409);

      expect(res.body.message).toMatch(/does not require technical support/);
      expect(await assigneeOf(event.id)).toBeNull();
    });

    // TC-S4-76 · US-61 AC-1 · setup: tc-s4-76-setup + tc-s4-76b-setup · fails if an available Technical Support member cannot be assigned and recorded, the change is not in the history, or someone who is not Technical Support, or an event that needs no support, can be assigned
    // Code: EventsTechnicalSupportService.getAssignment / assign / unassign; technical-support.rules (requiresTechnicalSupport)
    it('US-61 AC-1: a user without the Technical Support role cannot be assigned', async () => {
      await given('tc-s4-76b-setup');
      const event = townHall;

      await assign(event.id, ids.otherCoordinator).expect(400);
      expect(await assigneeOf(event.id)).toBeNull();
    });
  });

  describe('AC-1: assignments that cannot be made or removed', () => {
    // TC-S4-76 · US-61 AC-1 · setup: tc-s4-76-setup + tc-s4-76b-setup + tc-s4-76c-setup · fails if re-assigning the current member, or an unknown one, changes anything
    // Code: EventsTechnicalSupportService.assign (same member 400; assertIsTechnicalSupport 404)
    it('refuses the member already assigned (400) and an unknown member (404)', async () => {
      await given('tc-s4-76b-setup', 'tc-s4-76c-setup');

      await assign(townHall.id, ids.wei).expect(400);
      await assign(townHall.id, 'USR-999').expect(404);

      expect(await assigneeOf(townHall.id)).toBe(ids.wei);
    });

    // TC-S4-76 · US-61 AC-1 · setup: tc-s4-76-setup + tc-s4-77c-setup + tc-s4-76b-setup · fails if a cancelled event's assignment can be changed, or removing with nobody assigned is accepted
    // Code: EventsTechnicalSupportService.assign / unassign (TECH_SUPPORT_ASSIGNABLE_STATUSES; nobody assigned 409)
    it('refuses changes on a cancelled event, and removing when nobody is assigned (409)', async () => {
      await given('tc-s4-77c-setup', 'tc-s4-76b-setup');
      const remove = (eventId: string) =>
        http().delete(`/events/${eventId}/technical-support`).set('Authorization', as('coordinator'));

      await assign('EVT-308', ids.nadia).expect(409);
      await remove('EVT-308').expect(409);
      await remove(townHall.id).expect(409);

      expect(await assigneeOf('EVT-308')).toBe(ids.wei);
    });
  });

  describe('AC-2: an overlapping assignment is blocked and the conflict shown', () => {
    // TC-S4-77 · US-61 AC-2 · setup: tc-s4-76-setup + tc-s4-77-setup + tc-s4-76b-setup · fails if a member already on an overlapping event can be assigned, the conflict is not shown, or a back-to-back or cancelled event counts as a conflict
    // Code: technical-support.rules (windowsOverlap, conflictingAssignments); EventsTechnicalSupportService.assign (409 with conflicts)
    it('US-61 AC-2: overlapping assignment blocked, naming the conflicting event and time', async () => {
      await given('tc-s4-77-setup');
      const busy = { id: 'EVT-306' };
      await given('tc-s4-76b-setup');
      const event = townHall;

      const res = await assign(event.id, ids.wei).expect(409);

      expect(res.body.message).toMatch(/Wei Technical is already assigned to "Product Launch"/);
      expect(res.body.noneAvailable).toBe(false);
      expect(res.body.conflicts).toEqual([
        {
          eventId: busy.id,
          name: 'Product Launch',
          start: at('11:00').toISOString(),
          end: at('13:00').toISOString(),
        },
      ]);
      expect(await assigneeOf(event.id)).toBeNull();
    });

    // TC-S4-77 · US-61 AC-2 · setup: tc-s4-76-setup + tc-s4-77-setup + tc-s4-76b-setup · fails if a member already on an overlapping event can be assigned, the conflict is not shown, or a back-to-back or cancelled event counts as a conflict
    // Code: technical-support.rules (windowsOverlap, conflictingAssignments); EventsTechnicalSupportService.assign (409 with conflicts)
    it('US-61 AC-2: the assignment screen shows the conflict before anything is attempted', async () => {
      await given('tc-s4-77-setup');
      const busy = { id: 'EVT-306' };
      await given('tc-s4-76b-setup');
      const event = townHall;

      const res = await getAssignment(event.id).expect(200);
      const wei = res.body.staff.find((s: { id: string }) => s.id === ids.wei);

      expect(wei.available).toBe(false);
      expect(wei.conflicts.map((c: { eventId: string }) => c.eventId)).toEqual([busy.id]);
    });

    // TC-S4-77 · US-61 AC-2 · setup: tc-s4-76-setup + tc-s4-77b-setup + tc-s4-76b-setup · fails if a member already on an overlapping event can be assigned, the conflict is not shown, or a back-to-back or cancelled event counts as a conflict
    // Code: technical-support.rules (windowsOverlap, conflictingAssignments); EventsTechnicalSupportService.assign (409 with conflicts)
    it('US-61 AC-2: a back-to-back event is not a conflict', async () => {
      await given('tc-s4-77b-setup');
      await given('tc-s4-76b-setup');
      const event = townHall;

      await assign(event.id, ids.wei).expect(200);
    });

    // TC-S4-77 · US-61 AC-2 · setup: tc-s4-76-setup + tc-s4-77c-setup + tc-s4-76b-setup · fails if a member already on an overlapping event can be assigned, the conflict is not shown, or a back-to-back or cancelled event counts as a conflict
    // Code: technical-support.rules (windowsOverlap, conflictingAssignments); EventsTechnicalSupportService.assign (409 with conflicts)
    it('US-61 AC-2: a cancelled event no longer holds its assignee', async () => {
      await given('tc-s4-77c-setup');
      await given('tc-s4-76b-setup');
      const event = townHall;

      await assign(event.id, ids.wei).expect(200);
    });
  });

  describe('AC-3: the assigned member sees the event in their own list', () => {
    // TC-S4-78 · US-61 AC-3 · setup: tc-s4-76-setup + tc-s4-76b-setup + tc-s4-78-setup · fails if the assignee's list misses the date, time, venue or technical requirements, shows someone else's event, keeps a cancelled one, or is open to other roles
    // Code: TechnicalSupportAssignmentsService.findMine
    it('US-61 AC-3: assigned staff sees date, time, venue and technical requirements', async () => {
      await given('tc-s4-76b-setup', 'tc-s4-78-setup');
      const event = townHall;
      await assign(event.id, ids.wei).expect(200);

      const res = await http()
        .get('/technical-support/assignments')
        .set('Authorization', as('wei'))
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        eventId: event.id,
        name: 'Town Hall',
        proposedStart: at('10:00').toISOString(),
        proposedEnd: at('12:00').toISOString(),
        organiserEquipmentNeeds: 'A projector and two microphones',
        technicalSupportNeeds: 'On-site AV technician for the keynote',
        coordinatorRequirements: [
          expect.objectContaining({ equipmentType: 'Wireless microphone', quantity: 2, notes: 'Lapel' }),
        ],
        venues: [expect.objectContaining({ venueName: 'Harbour Hall', status: BookingStatus.APPROVED })],
      });
    });

    // TC-S4-78 · US-61 AC-3 · setup: tc-s4-76-setup + tc-s4-76b-setup · fails if the assignee's list misses the date, time, venue or technical requirements, shows someone else's event, keeps a cancelled one, or is open to other roles
    // Code: TechnicalSupportAssignmentsService.findMine
    it('US-61 AC-3: another member does not see someone else’s assignment', async () => {
      await given('tc-s4-76b-setup');
      const event = townHall;
      await assign(event.id, ids.wei).expect(200);

      const res = await http()
        .get('/technical-support/assignments')
        .set('Authorization', as('nadia'))
        .expect(200);

      expect(res.body).toEqual([]);
    });

    // TC-S4-78 · US-61 AC-3 · setup: tc-s4-76-setup + tc-s4-77c-setup · fails if the assignee's list misses the date, time, venue or technical requirements, shows someone else's event, keeps a cancelled one, or is open to other roles
    // Code: TechnicalSupportAssignmentsService.findMine
    it('US-61 AC-3: an event that has ended drops out of the list', async () => {
      await given('tc-s4-77c-setup'); // Wei's event, since cancelled

      const res = await http()
        .get('/technical-support/assignments')
        .set('Authorization', as('wei'))
        .expect(200);

      expect(res.body).toEqual([]);
    });

    // TC-S4-78 · US-61 AC-3 · setup: tc-s4-76-setup · fails if the assignee's list misses the date, time, venue or technical requirements, shows someone else's event, keeps a cancelled one, or is open to other roles
    // Code: TechnicalSupportAssignmentsService.findMine
    it('US-61 AC-3: only Technical Support can read an assignment list', async () => {
      await http()
        .get('/technical-support/assignments')
        .set('Authorization', as('coordinator'))
        .expect(403);
    });
  });

  describe('AC-4: nobody available', () => {
    const fillEveryone = async () => {
      await given('tc-s4-79-setup');
    };

    // TC-S4-79 · US-61 AC-4 · setup: tc-s4-76-setup + tc-s4-79-setup + tc-s4-76b-setup · fails if the screen does not say nobody is available, or an assignment is made anyway
    // Code: technical-support.rules (NO_TECH_SUPPORT_AVAILABLE_MESSAGE); EventsTechnicalSupportService.getAssignment / assign
    it('US-61 AC-4: no-one available shows the message on the assignment screen', async () => {
      await fillEveryone();
      await given('tc-s4-76b-setup');
      const event = townHall;

      const res = await getAssignment(event.id).expect(200);

      expect(res.body.noneAvailable).toBe(true);
      expect(res.body.message).toBe(NO_TECH_SUPPORT_AVAILABLE_MESSAGE);
      expect(res.body.staff.every((s: { available: boolean }) => !s.available)).toBe(true);
    });

    // TC-S4-79 · US-61 AC-4 · setup: tc-s4-76-setup + tc-s4-79-setup + tc-s4-76b-setup · fails if the screen does not say nobody is available, or an assignment is made anyway
    // Code: technical-support.rules (NO_TECH_SUPPORT_AVAILABLE_MESSAGE); EventsTechnicalSupportService.getAssignment / assign
    it('US-61 AC-4: attempting to assign anyway makes no assignment and returns the message', async () => {
      await fillEveryone();
      await given('tc-s4-76b-setup');
      const event = townHall;

      const res = await assign(event.id, ids.wei).expect(409);

      expect(res.body.message).toBe(NO_TECH_SUPPORT_AVAILABLE_MESSAGE);
      expect(res.body.noneAvailable).toBe(true);
      expect(await assigneeOf(event.id)).toBeNull();
      expect(await prisma.eventChange.count({ where: { eventId: event.id } })).toBe(0);
    });

    // TC-S4-79 · US-61 AC-4 · setup: tc-s4-76-setup + tc-s4-79b-setup + tc-s4-76b-setup · fails if the screen does not say nobody is available, or an assignment is made anyway
    // Code: technical-support.rules (NO_TECH_SUPPORT_AVAILABLE_MESSAGE); EventsTechnicalSupportService.getAssignment / assign
    it('US-61 AC-4: with no Technical Support accounts at all, the message is shown', async () => {
      await given('tc-s4-79b-setup'); // no Technical Support accounts
      await given('tc-s4-76b-setup');
      const event = townHall;

      const res = await getAssignment(event.id).expect(200);

      expect(res.body.staff).toEqual([]);
      expect(res.body.message).toBe(NO_TECH_SUPPORT_AVAILABLE_MESSAGE);
    });
  });

  describe('only the assigned Coordinator may assign', () => {
    // TC-S4-76 · US-61 AC-1 · setup: tc-s4-76-setup + tc-s4-76b-setup · fails if anyone but the event's assigned Coordinator can read or change the assignment
    // Code: EventsTechnicalSupportService (assigned Coordinator only); @Roles(EVENT_COORDINATOR)
    it.each(['organiser', 'wei', 'lead'])('US-61: non-Coordinators can’t assign (%s → 403)', async (who) => {
      await given('tc-s4-76b-setup');
      const event = townHall;

      await assign(event.id, ids.nadia, who).expect(403);
      await getAssignment(event.id, who).expect(403);
      expect(await assigneeOf(event.id)).toBeNull();
    });

    // TC-S4-76 · US-61 AC-1 · setup: tc-s4-76-setup + tc-s4-76b-setup · fails if anyone but the event's assigned Coordinator can read or change the assignment
    // Code: EventsTechnicalSupportService (assigned Coordinator only); @Roles(EVENT_COORDINATOR)
    it('US-61: a Coordinator not assigned to the event cannot assign', async () => {
      await given('tc-s4-76b-setup');
      const event = townHall;

      const res = await assign(event.id, ids.nadia, 'otherCoordinator');

      expect([403, 404]).toContain(res.status);
      expect(await assigneeOf(event.id)).toBeNull();
    });

    // TC-S4-76 · US-61 AC-1 · setup: tc-s4-76-setup + tc-s4-76b-setup · fails if anyone but the event's assigned Coordinator can read or change the assignment
    // Code: EventsTechnicalSupportService (assigned Coordinator only); @Roles(EVENT_COORDINATOR)
    it('US-61: an unauthenticated request is refused', async () => {
      await given('tc-s4-76b-setup');
      const event = townHall;

      await http().put(`/events/${event.id}/technical-support`).send({ staffId: ids.wei }).expect(401);
    });
  });
});
