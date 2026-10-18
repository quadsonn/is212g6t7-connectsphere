import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, PrismaClient, Role } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-24 (Story 24) — the Coordinator updates an event's information during planning.
 * US-25 (Story 25) — the history of changes made to an event's information.
 * Integration tests, one describe per acceptance criterion.
 *
 * The code under test:
 *  - PATCH /events/:id/planning -> EventsService.updateDuringPlanning():
 *    checks the caller is the assigned Coordinator and the event is in
 *    PLANNING, diffs the sent fields against the stored row
 *    (diffEventFields), writes only what changed, and records one EventChange
 *    row. If a changed field feeds an arrangement already APPROVED (venue
 *    booking or equipment reservation), the change is still saved but flagged
 *    requiresReview with the arrangements affected (affectedArrangements).
 *  - POST /events/:id/start-planning moves an APPROVED event into PLANNING.
 *  - GET /events/:id/history -> getChangeHistory(): the EventChange rows,
 *    oldest first, each with its field changes (previous/next), who and when,
 *    plus a "no changes" message when there are none.
 *  - Reads (GET /events, /events/:id) load the row fresh, and Venue Staff and
 *    Technical Support see an event only when it is RELATED to them (a
 *    booking on a venue they manage, or an equipment reservation).
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql, base-venues.sql and tc-s2-68-setup.sql
 * (one event in PLANNING); some tests then load a further tc-s2 script, as
 * their test case names (docs/testing/sprint2-test-cases.md).
 */
describe('Story 24 planning edits / Story 25 change history (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';

  /** Fixed users from base-users.sql. */
  const USERS = {
    coordinator: 'coord.a@example.com',
    otherCoordinator: 'coord.b@example.com',
    organiser: 'organiser@example.com',
    venueStaff: 'venue.staff@example.com',
    tech: 'tech.support@example.com',
    attendee: 'attendee@example.com',
  } as const;
  const tokens: Record<string, string> = {};

  /** Fixed events from tc-s2-68/70/74/77-setup.sql. */
  const EVENT = {
    planning: 'e-s2-planning',
    underReview: 'e-s2-under-review',
    approved: 'e-s2-approved',
    unrelated: 'e-s2-unrelated',
    returned: 'e-s2-returned',
  } as const;

  const as = (who: keyof typeof USERS) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  /** A planning edit, as the assigned Coordinator by default. */
  const edit = (body: Record<string, unknown>, who: keyof typeof USERS = 'coordinator', eventId: string = EVENT.planning) =>
    http().patch(`/events/${eventId}/planning`).set('Authorization', as(who)).send(body);

  const history = (who: keyof typeof USERS = 'coordinator', eventId: string = EVENT.planning) =>
    http().get(`/events/${eventId}/history`).set('Authorization', as(who));

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
    await given('base-users', 'base-venues', 'tc-s2-68-setup');
  });

  describe('US-24 AC-1: edits during planning are saved', () => {
    // TC-S2-68 · US-24 AC-1 · setup: base-users + base-venues + tc-s2-68-setup · fails if a planning edit wasn't saved to the event record
    // Code: updateDuringPlanning() writes the changed fields, then returns the event re-read from the database.
    it('saves the programme and attendance to the event record', async () => {
      const res = await edit({ programme: '09:00 Welcome\n10:00 Campus tour', expectedAttendance: 350 }).expect(200);

      expect(res.body).toMatchObject({ programme: '09:00 Welcome\n10:00 Campus tour', expectedAttendance: 350 });
      expect(await stored()).toMatchObject({ programme: '09:00 Welcome\n10:00 Campus tour', expectedAttendance: 350 });
    });

    // TC-S2-68 · US-24 AC-1 · setup: base-users + base-venues + tc-s2-68-setup · fails if fields that weren't sent were cleared or changed
    // Code: only the fields diffEventFields() reports as changed are written.
    it('leaves fields that were not sent untouched', async () => {
      await edit({ expectedAttendance: 350 }).expect(200);

      expect(await stored()).toMatchObject({ name: 'Freshman Orientation 2030', equipmentNeeds: 'Two projectors' });
    });

    // TC-S2-68 · US-24 AC-1 · setup: base-users + base-venues + tc-s2-68-setup · fails if editing an event changed its status
    // Code: a planning edit never touches status; statuses only change through setStatus().
    it('does not change the status', async () => {
      const res = await edit({ expectedAttendance: 350 }).expect(200);

      expect(res.body.status).toBe(EventStatus.PLANNING);
    });
  });

  describe('US-24 AC-1: invalid edits are refused', () => {
    // TC-S2-69 · US-24 AC-1 · setup: base-users + base-venues + tc-s2-68-setup · fails if a required field could be emptied
    // Code: UpdatePlanningDto refuses '' and null for required fields with 400.
    it('rejects emptying a required field', async () => {
      const res = await edit({ name: '' }).expect(400);
      expect(res.body.message).toContain('name cannot be empty');

      await edit({ name: null }).expect(400);
      expect((await stored()).name).toBe('Freshman Orientation 2030');
    });

    // TC-S2-69 · US-24 AC-1 · setup: base-users + base-venues + tc-s2-68-setup · fails if an end before the stored start were saved
    // Code: assertDatesInOrder() compares a sent end with the stored start (and the reverse), which the DTO alone can't see.
    it('rejects an end before the stored start', async () => {
      const res = await edit({ proposedEnd: '2030-10-01T08:00:00Z' }).expect(400);

      expect(res.body.message).toContain('proposedEnd must be later than proposedStart');
    });
  });

  describe('US-24 AC-1: only the assigned Coordinator, only during planning', () => {
    // TC-S2-70 · US-24 AC-1 · setup: base-users + base-venues + tc-s2-68-setup + tc-s2-70-setup · fails if an event not yet in planning could be edited as a planning edit
    // Code: assertInPlanning() answers 409 for any status outside PLANNING_STATUSES.
    it('refuses an event that is not in planning (409)', async () => {
      await given('tc-s2-70-setup');

      await edit({ expectedAttendance: 350 }, 'coordinator', EVENT.underReview).expect(409);
    });

    // TC-S2-70 · US-24 AC-1 · setup: base-users + base-venues + tc-s2-68-setup · fails if a Coordinator could edit an event assigned to someone else
    // Code: assertEventAccess() hides events outside the caller's scope as 404.
    it('hides the event from a Coordinator it is not assigned to (404)', async () => {
      await edit({ expectedAttendance: 350 }, 'otherCoordinator').expect(404);
    });

    // TC-S2-70 · US-24 AC-1 · setup: base-users + base-venues + tc-s2-68-setup · fails if the Organiser could make planning edits
    // Code: the permission matrix gives Organisers no planning update, so the guard answers 403.
    it('refuses the Organiser, even for their own event (403)', async () => {
      await edit({ expectedAttendance: 350 }, 'organiser').expect(403);
      expect((await stored()).expectedAttendance).toBe(320);
    });

    // TC-S2-70 · US-24 AC-1 · setup: base-users + base-venues + tc-s2-68-setup + tc-s2-70-setup · fails if an approved event could never reach planning
    // Code: startPlanning() moves APPROVED -> PLANNING through setStatus().
    it('moves an approved event into planning, after which it can be edited', async () => {
      await given('tc-s2-70-setup');

      const res = await http()
        .post(`/events/${EVENT.approved}/start-planning`)
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(res.body.status).toBe(EventStatus.PLANNING);
      await edit({ expectedAttendance: 350 }, 'coordinator', EVENT.approved).expect(200);
    });
  });

  describe('US-24 AC-2: changes to confirmed arrangements are flagged for review', () => {
    // TC-S2-71 · US-24 AC-2 · setup: base-users + base-venues + tc-s2-68-setup + tc-s2-71-setup · fails if changing attendance after the venue was confirmed went unflagged
    // Code: affectedArrangements() maps expectedAttendance to VENUE_BOOKING, and
    // confirmedArrangements() finds an APPROVED booking, so requiresReview is true.
    it('flags an attendance change when the venue booking is approved', async () => {
      await given('tc-s2-71-setup');

      const res = await edit({ expectedAttendance: 500 }).expect(200);

      expect(res.body.change).toMatchObject({ requiresReview: true, affectedArrangements: ['VENUE_BOOKING'] });
      expect((await stored()).expectedAttendance).toBe(500);
    });

    // TC-S2-71 · US-24 AC-2 · setup: base-users + base-venues + tc-s2-68-setup + tc-s2-71-setup · fails if the flag was only in the response and not kept
    // Code: recordChange() stores requiresReview on the EventChange row.
    it('keeps the flag on the history entry', async () => {
      await given('tc-s2-71-setup');
      await edit({ expectedAttendance: 500 }).expect(200);

      const res = await history().expect(200);

      expect(res.body.entries[0]).toMatchObject({ requiresReview: true, affectedArrangements: ['VENUE_BOOKING'] });
    });

    // TC-S2-72 · US-24 AC-2 · setup: base-users + base-venues + tc-s2-68-setup + tc-s2-71-setup + tc-s2-72-setup · fails if a date change didn't name both confirmed arrangements
    // Code: the dates feed both the venue booking and the equipment reservation,
    // so both are listed when both are APPROVED.
    it('flags a date change against both venue and equipment', async () => {
      await given('tc-s2-71-setup', 'tc-s2-72-setup');

      const res = await edit({ proposedStart: '2030-10-02T09:00:00Z', proposedEnd: '2030-10-02T17:00:00Z' }).expect(200);

      expect(res.body.change.affectedArrangements).toEqual(['VENUE_BOOKING', 'EQUIPMENT_RESERVATION']);
    });

    // TC-S2-73 · US-24 AC-2 · setup: base-users + base-venues + tc-s2-68-setup + tc-s2-73-setup · fails if a change was flagged when nothing had been confirmed yet
    // Code: confirmedArrangements() counts APPROVED rows only; a REQUESTED booking isn't confirmed.
    it('treats the change as ordinary when the booking is only requested', async () => {
      await given('tc-s2-73-setup');

      const res = await edit({ expectedAttendance: 500 }).expect(200);

      expect(res.body.change.requiresReview).toBe(false);
    });

    // TC-S2-73 · US-24 AC-2 · setup: base-users + base-venues + tc-s2-68-setup + tc-s2-71-setup · fails if a change no arrangement depends on was flagged
    // Code: the programme feeds no arrangement in ARRANGEMENT_SENSITIVE_FIELDS.
    it('treats a programme change as ordinary even with confirmed arrangements', async () => {
      await given('tc-s2-71-setup');

      const res = await edit({ programme: 'Revised running order' }).expect(200);

      expect(res.body.change).toMatchObject({ requiresReview: false, affectedArrangements: [] });
    });
  });

  describe('US-24 AC-3: relevant users see the latest saved information', () => {
    // TC-S2-74 · US-24 AC-3 · setup: base-users + base-venues + tc-s2-68-setup + tc-s2-71-setup · fails if Venue Staff saw stale event details after an edit
    // Code: Venue Staff read the event at RELATED scope (a booking on a venue they manage); the read loads the row fresh.
    it('shows Venue Staff the updated event when it has a booking', async () => {
      await given('tc-s2-71-setup');
      await edit({ expectedAttendance: 500 }).expect(200);

      const res = await http().get(`/events/${EVENT.planning}`).set('Authorization', as('venueStaff')).expect(200);

      expect(res.body.expectedAttendance).toBe(500);
    });

    // TC-S2-74 · US-24 AC-3 · setup: base-users + base-venues + tc-s2-68-setup + tc-s2-74-setup · fails if Technical Support saw stale equipment needs after an edit
    // Code: Technical Support read the event at RELATED scope (an equipment reservation for it).
    it('shows Technical Support the updated equipment needs', async () => {
      await given('tc-s2-74-setup');
      await edit({ equipmentNeeds: 'Three projectors' }).expect(200);

      const res = await http().get(`/events/${EVENT.planning}`).set('Authorization', as('tech')).expect(200);

      expect(res.body.equipmentNeeds).toBe('Three projectors');
    });

    // TC-S2-74 · US-24 AC-3 · setup: base-users + base-venues + tc-s2-68-setup + tc-s2-71-setup + tc-s2-74-setup · fails if staff could list events unrelated to their work
    // Code: GET /events for Venue Staff is filtered to events with a booking on their venues.
    it('lists only related events for Venue Staff', async () => {
      await given('tc-s2-71-setup', 'tc-s2-74-setup');

      const res = await http().get('/events').set('Authorization', as('venueStaff')).expect(200);

      expect(res.body.map((e: { id: string }) => e.id)).toEqual([EVENT.planning]);
    });

    // TC-S2-74 · US-24 AC-3 · setup: base-users + base-venues + tc-s2-68-setup · fails if Venue Staff could open an event with no booking on their venues
    // Code: outside RELATED scope the event reads as not found (404).
    it('hides an event with no booking from Venue Staff (404)', async () => {
      await http().get(`/events/${EVENT.planning}`).set('Authorization', as('venueStaff')).expect(404);
    });

    // TC-S2-74 · US-24 AC-3 · setup: base-users + base-venues + tc-s2-68-setup · fails if the Coordinator's own view showed stale information
    // Code: GET /events/assigned/:id reads the saved row.
    it('shows the assigned Coordinator the update too', async () => {
      await edit({ programme: 'New programme' }).expect(200);

      const res = await http().get(`/events/assigned/${EVENT.planning}`).set('Authorization', as('coordinator')).expect(200);

      expect(res.body.programme).toBe('New programme');
    });
  });

  describe('US-25 AC-1: a chronological list of changes', () => {
    // TC-S2-75 · US-25 AC-1 · setup: base-users + base-venues + tc-s2-68-setup · fails if changes made through the app were missing or out of order
    // Code: each planning edit adds one EventChange row; getChangeHistory() orders by createdAt, then id.
    it('lists changes oldest first', async () => {
      await edit({ expectedAttendance: 350 }).expect(200);
      await edit({ programme: 'First draft' }).expect(200);
      await edit({ expectedAttendance: 400 }).expect(200);

      const res = await history().expect(200);

      expect(res.body.entries.map((e: { changes: { field: string }[] }) => e.changes[0].field)).toEqual([
        'expectedAttendance',
        'programme',
        'expectedAttendance',
      ]);
      const times = res.body.entries.map((e: { createdAt: string }) => Date.parse(e.createdAt));
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    });

    // TC-S2-75 · US-25 AC-1 · setup: base-users + base-venues + tc-s2-68-setup · fails if a save that changed nothing cluttered the history
    // Code: when diffEventFields() finds no differences, nothing is written and change is null.
    it('does not record a save that changed nothing', async () => {
      const res = await edit({ expectedAttendance: 320 }).expect(200);
      expect(res.body.change).toBeNull();

      expect((await history().expect(200)).body.entries).toEqual([]);
    });

    // TC-S2-76 · US-25 AC-1 · setup: base-users + base-venues + tc-s2-68-setup + tc-s2-76-setup · fails if the history followed insertion order instead of when each change was made
    // Code: the ORDER BY createdAt in getChangeHistory(), not the order rows were written.
    it('sorts recorded changes by time, whatever order they were stored in', async () => {
      await given('tc-s2-76-setup');

      const res = await history().expect(200);

      expect(res.body.entries.map((e: { id: string }) => e.id)).toEqual(['c-s2-76-first', 'c-s2-76-second', 'c-s2-76-third']);
    });

    // TC-S2-77 · US-25 AC-1 · setup: base-users + base-venues + tc-s2-68-setup + tc-s2-77-setup · fails if the Organiser's amendments to a returned request were left out of the history
    // Code: PATCH /events/:id on a RETURNED request records its changes through the same recordChange().
    it("includes an Organiser's amendments to a returned request", async () => {
      await given('tc-s2-77-setup');

      await http()
        .patch(`/events/${EVENT.returned}`)
        .set('Authorization', as('organiser'))
        .send({ expectedAttendance: 250 })
        .expect(200);

      const res = await history('coordinator', EVENT.returned).expect(200);
      expect(res.body.entries).toHaveLength(1);
      expect(res.body.entries[0].changedBy.id).toBe('u-organiser');
    });

    // TC-S2-78 · US-25 · setup: base-users + base-venues + tc-s2-68-setup · fails if a Coordinator could read the history of an event they can't see
    // Code: getChangeHistory() uses the same EVENT/READ check as the event itself.
    it('is not available to a Coordinator who cannot see the event (404)', async () => {
      await history('otherCoordinator').expect(404);
    });

    // TC-S2-78 · US-25 · setup: base-users + base-venues + tc-s2-68-setup · fails if a role other than Coordinator could read the history
    // Code: the history route is restricted to Coordinators by the permission guard.
    it.each(['organiser', 'venueStaff', 'tech', 'attendee'] as const)('is refused to %s (403)', async (who) => {
      await history(who).expect(403);
    });
  });

  describe('US-25 AC-2: each entry shows what changed, the previous and new value, who and when', () => {
    // TC-S2-79 · US-25 AC-2 · setup: base-users + base-venues + tc-s2-68-setup · fails if an entry lacked a field's old or new value, the person or the time
    // Code: diffEventFields() stores { field, previous, next } per changed
    // field; toChangeEntry() adds changedBy (id, name, email, role) and createdAt.
    it('records every changed field with its previous and new value', async () => {
      await edit({ expectedAttendance: 350, proposedEnd: '2030-10-01T18:00:00Z' }).expect(200);

      const [entry] = (await history().expect(200)).body.entries;

      expect(entry.changes).toEqual([
        { field: 'proposedEnd', previous: '2030-10-01T17:00:00.000Z', next: '2030-10-01T18:00:00.000Z' },
        { field: 'expectedAttendance', previous: 320, next: 350 },
      ]);
      expect(entry.changedBy).toEqual({
        id: 'u-coordinator-a',
        name: 'Cody Coordinator',
        email: 'coord.a@example.com',
        role: Role.EVENT_COORDINATOR,
      });
      expect(Number.isNaN(Date.parse(entry.createdAt))).toBe(false);
    });
  });

  describe('US-25 AC-3: no changes recorded', () => {
    // TC-S2-80 · US-25 AC-3 · setup: base-users + base-venues + tc-s2-68-setup · fails if an event with no changes showed a blank list without saying why
    // Code: getChangeHistory() returns NO_CHANGES_MESSAGE when there are no entries.
    it('says so explicitly', async () => {
      const res = await history().expect(200);

      expect(res.body.entries).toEqual([]);
      expect(res.body.message).toBe('No changes have been recorded for this event since it was created.');
    });
  });
});
