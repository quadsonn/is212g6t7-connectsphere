import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ChangeRequestStatus, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-37 (Story 37) — the Event Coordinator reviews the change requests
 * Organisers submit (Story 36) and approves or rejects them. Integration
 * tests, one describe per acceptance criterion.
 *
 * The code under test (EventsChangeReviewService, every route
 * @Roles(EVENT_COORDINATOR)):
 *  - GET /events/change-requests/pending -> listPending(): PENDING requests on
 *    events assigned to the caller, oldest first (AC-1).
 *  - GET /events/change-requests/:id -> getForReview(): the event as it is now
 *    beside the proposal and the Organiser's reason (AC-2), with a capacity
 *    warning for each live booking the proposed attendance would not fit
 *    (capacityWarnings(), AC-6) and the reschedule impact of a date change.
 *  - POST .../reject -> reject(): RejectChangeRequestDto requires a trimmed
 *    reason (AC-3); the request becomes REJECTED and the event is untouched.
 *    The Organiser then reads the decision as latestChangeDecision on their
 *    event (AC-5).
 *  - POST .../approve -> approve(): re-checks the event is still changeable
 *    and the dates still make sense (applicabilityErrors()), then in one
 *    transaction claims the request (PENDING -> APPROVED, so a second
 *    decision gets 409), writes the proposed values to the event, replaces
 *    only its catalogue-linked equipment lines (keeping their notes), moves
 *    bookings for a date change, and records the change in the event's
 *    history under the Coordinator's name (AC-4).
 *  - load(): a request on an event not assigned to the caller is 404.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql, base-venues.sql, tc-s2-159-setup.sql and
 * tc-s2-172-setup.sql (pending requests on Cody's and Casey's events, and one
 * already decided); one test then loads tc-s2-178 (docs/testing/sprint2-test-cases.md).
 */
describe('Story 37 review change requests (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';

  /** Fixed users from base-users.sql. */
  const USERS = {
    cody: 'coord.a@example.com',
    casey: 'coord.b@example.com',
    organiser: 'organiser@example.com',
    attendee: 'attendee@example.com',
  } as const;
  const tokens: Record<string, string> = {};

  /** Fixed rows from tc-s2-172/177-setup.sql. */
  const CR = {
    attendance: 'CRQ-001', // EVT-063 ("Tech Talk"): 120 -> 350, Main Hall holds 300
    dates: 'CRQ-002', // EVT-067 ("Open House"): 1 Oct -> 2 Oct 2030
    theirs: 'CRQ-005', // on Casey's event
    kit: 'CRQ-004', // EVT-069: new equipment list
  } as const;

  const as = (who: keyof typeof USERS) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const review = (id: string, who: keyof typeof USERS = 'cody') =>
    http().get(`/events/change-requests/${id}`).set('Authorization', as(who));
  const decide = (id: string, action: 'approve' | 'reject', body: object = {}, who: keyof typeof USERS = 'cody') =>
    http().post(`/events/change-requests/${id}/${action}`).set('Authorization', as(who)).send(body);

  const statusOf = async (id: string) => (await prisma.eventChangeRequest.findUniqueOrThrow({ where: { id } })).status;
  const event = (id: string) => prisma.eventRequest.findUniqueOrThrow({ where: { id } });

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
    await given('base-users', 'base-venues', 'tc-s2-159-setup', 'tc-s2-172-setup');
  });

  describe('AC-1: pending requests on my own events, oldest first', () => {
    // TC-S2-172 · US-37 AC-1 · setup: base-users + base-venues + tc-s2-159-setup + tc-s2-172-setup · fails if a Coordinator saw another Coordinator's or an already-decided request, or the oldest wasn't first
    // Code: listPending() filters PENDING and event.coordinatorId = the caller, ordered by createdAt.
    it("lists only my pending requests, oldest first", async () => {
      const res = await http().get('/events/change-requests/pending').set('Authorization', as('cody')).expect(200);

      expect(res.body.map((r: { id: string }) => r.id)).toEqual([CR.dates, CR.attendance]);
      expect(res.body[0]).toMatchObject({
        reason: 'Clashes with exams',
        requestedBy: { id: 'USR-006', name: 'Olivia Organiser' },
        event: { id: 'EVT-067', name: 'Open House' },
      });
    });

    // TC-S2-172 · US-37 AC-1 · setup: base-users + base-venues + tc-s2-159-setup + tc-s2-172-setup · fails if each Coordinator didn't see their own requests
    // Code: the same filter, for Casey.
    it("shows another Coordinator only theirs", async () => {
      const res = await http().get('/events/change-requests/pending').set('Authorization', as('casey')).expect(200);

      expect(res.body.map((r: { id: string }) => r.id)).toEqual([CR.theirs]);
    });
  });

  describe('AC-2: a request shows the event as it is now beside what is proposed, with the reason', () => {
    // TC-S2-173 · US-37 AC-2 · setup: base-users + base-venues + tc-s2-159-setup + tc-s2-172-setup · fails if the review lacked the current values, the proposed ones, the reason or who asked
    // Code: getForReview() returns the request (proposal, reason, requester) and the event's current dates, attendance and equipment.
    it('shows current and proposed values, the reason and the requester', async () => {
      const res = await review(CR.attendance).expect(200);

      expect(res.body.request).toMatchObject({
        id: CR.attendance,
        status: 'PENDING',
        reason: 'More sign-ups than expected',
        proposedAttendance: 350,
        proposedStart: null,
        requestedBy: { id: 'USR-006', name: 'Olivia Organiser' },
      });
      expect(res.body.event).toMatchObject({
        id: 'EVT-063',
        name: 'Tech Talk',
        expectedAttendance: 120,
        proposedStart: '2030-10-01T09:00:00.000Z',
        proposedEnd: '2030-10-01T17:00:00.000Z',
      });
      expect(res.body.event.equipmentRequirements.map((r: { equipmentType: string }) => r.equipmentType)).toEqual([
        'Projector',
        'Banner stand',
      ]);
    });

    // TC-S2-173 · US-37 AC-2 · setup: base-users + base-venues + tc-s2-159-setup + tc-s2-172-setup · fails if a date change didn't show the new window it would give the event
    // Code: the arrangement check (US-48) returns check.newWindow when the request moves the event's dates.
    it('shows the new window a date change would give the event', async () => {
      const res = await review(CR.dates).expect(200);

      expect(res.body.check.newWindow).toEqual({ start: '2030-10-02T09:00:00.000Z', end: '2030-10-02T17:00:00.000Z' });
    });
  });

  describe('AC-6: a warning when the proposed attendance exceeds a booked venue', () => {
    // TC-S2-174 · US-37 AC-6 · setup: base-users + base-venues + tc-s2-159-setup + tc-s2-172-setup · fails if a proposed attendance over the booked venue's capacity raised no warning
    // Code: capacityWarnings() warns for each live booking whose venue holds fewer than proposed.
    it('warns that 350 exceeds Main Hall (300)', async () => {
      const res = await review(CR.attendance).expect(200);

      expect(res.body.warnings).toEqual([
        expect.objectContaining({
          type: 'CAPACITY_EXCEEDED',
          bookingId: 'BKG-057',
          venueName: 'Main Hall',
          capacity: 300,
          proposedAttendance: 350,
          message: 'The proposed attendance of 350 exceeds the capacity of Main Hall (300).',
        }),
      ]);
    });

    // TC-S2-174 · US-37 AC-6 · setup: base-users + base-venues + tc-s2-159-setup + tc-s2-172-setup · fails if a request not changing attendance raised a capacity warning
    // Code: capacityWarnings() returns nothing when proposedAttendance is null.
    it('raises no capacity warning when attendance is not changing', async () => {
      const res = await review(CR.dates).expect(200);

      expect(res.body.warnings).toEqual([]);
    });
  });

  describe('AC-3: rejecting needs a reason', () => {
    // TC-S2-175 · US-37 AC-3 · setup: base-users + base-venues + tc-s2-159-setup + tc-s2-172-setup · fails if a request could be rejected without a real reason
    // Code: RejectChangeRequestDto trims the reason, then requires it (400); the request stays PENDING.
    it.each([
      ['no reason', {}],
      ['a reason of only spaces', { reason: '   ' }],
    ])('refuses a rejection with %s (400)', async (_case, body) => {
      const res = await decide(CR.attendance, 'reject', body).expect(400);

      expect(res.body.message).toContain('reason is required');
      expect(await statusOf(CR.attendance)).toBe(ChangeRequestStatus.PENDING);
    });

    // TC-S2-175 · US-37 AC-3, AC-5 · setup: base-users + base-venues + tc-s2-159-setup + tc-s2-172-setup · fails if a rejection with a reason didn't record it, or changed the event
    // Code: reject() sets REJECTED, decidedBy, decidedAt and decisionReason; it never writes the event.
    it('rejects with the reason, leaving the event unchanged', async () => {
      const res = await decide(CR.attendance, 'reject', { reason: 'Main Hall cannot hold 350' }).expect(200);

      expect(res.body).toMatchObject({
        status: 'REJECTED',
        decidedById: 'USR-004',
        decisionReason: 'Main Hall cannot hold 350',
      });
      expect((await event('EVT-063')).expectedAttendance).toBe(120);
    });
  });

  describe('AC-5: the Organiser sees the decision and its reason', () => {
    // TC-S2-176 · US-37 AC-5 · setup: base-users + base-venues + tc-s2-159-setup + tc-s2-172-setup · fails if the Organiser couldn't see the rejection and its reason on their event
    // Code: GET /events/:id for the Organiser adds latestChangeDecision, and pendingChangeRequest becomes null.
    it('shows the rejection and reason on the Organiser\'s event', async () => {
      await decide(CR.attendance, 'reject', { reason: 'Main Hall cannot hold 350' }).expect(200);

      const res = await http().get('/events/EVT-063').set('Authorization', as('organiser')).expect(200);

      expect(res.body.pendingChangeRequest).toBeNull();
      expect(res.body.latestChangeDecision).toMatchObject({
        id: CR.attendance,
        status: 'REJECTED',
        decisionReason: 'Main Hall cannot hold 350',
      });
    });
  });

  describe('AC-4: approving applies the change and records it', () => {
    // TC-S2-177 · US-37 AC-4 · setup: base-users + base-venues + tc-s2-159-setup + tc-s2-172-setup · fails if approving didn't apply the new attendance, or the history entry lacked who, what or when
    // Code: approve() writes the proposed values and calls recordChange();
    // attendance feeds the approved Main Hall booking, so the entry is flagged for review (Story 24).
    it('applies a new attendance and records it in the history', async () => {
      const res = await decide(CR.attendance, 'approve').expect(200);

      expect(res.body.request).toMatchObject({ status: 'APPROVED', decidedById: 'USR-004' });
      expect((await event('EVT-063')).expectedAttendance).toBe(350);
      expect(res.body.change).toMatchObject({
        changes: [{ field: 'expectedAttendance', previous: 120, next: 350 }],
        changedBy: { id: 'USR-004' },
        requiresReview: true,
        affectedArrangements: ['VENUE_BOOKING'],
      });
      expect(Number.isNaN(Date.parse(res.body.change.createdAt))).toBe(false);
    });

    // TC-S2-177 · US-37 AC-4 · setup: base-users + base-venues + tc-s2-159-setup + tc-s2-172-setup · fails if approving a date change didn't move the event's dates
    // Code: approve() writes the proposed start and end to the event.
    it('applies new dates', async () => {
      await decide(CR.dates, 'approve').expect(200);

      expect(await event('EVT-067')).toMatchObject({
        proposedStart: new Date('2030-10-02T09:00:00.000Z'),
        proposedEnd: new Date('2030-10-02T17:00:00.000Z'),
      });
    });

    // TC-S2-178 · US-37 AC-4 · setup: base-users + base-venues + tc-s2-159-setup + tc-s2-172-setup + tc-s2-178-setup · fails if approving an equipment change lost the free-text lines or a kept line's notes
    // Code: approve() replaces only the catalogue-linked lines, keeps a staying
    // line's notes, and leaves free-text lines alone.
    it("replaces the catalogue equipment, keeping notes and free-text lines", async () => {
      await given('tc-s2-178-setup');

      await decide(CR.kit, 'approve').expect(200);

      const lines = await prisma.equipmentRequirement.findMany({ where: { eventId: 'EVT-069' } });
      expect(lines.map((l) => [l.equipmentType, l.quantity, l.notes]).sort()).toEqual(
        [
          ['Banner stand', 1, null],
          ['Projector', 3, 'HDMI'],
          ['Wireless microphone', 4, null],
        ].sort(),
      );
    });
  });

  describe('a request is decided only once', () => {
    // TC-S2-179 · US-37 AC-3, AC-4 · setup: base-users + base-venues + tc-s2-159-setup + tc-s2-172-setup · fails if a decided request could be decided again
    // Code: assertPending() refuses anything but PENDING with 409.
    it('refuses a second decision (409)', async () => {
      await decide(CR.attendance, 'reject', { reason: 'No' }).expect(200);

      const res = await decide(CR.attendance, 'approve').expect(409);

      expect(res.body.message).toBe('this change request has already been decided');
      expect((await event('EVT-063')).expectedAttendance).toBe(120);
    });

    // TC-S2-179 · US-37 AC-3, AC-4 · setup: base-users + base-venues + tc-s2-159-setup + tc-s2-172-setup · fails if an approval and a rejection sent at once both took effect
    // Code: both claim the request with updateMany(where status PENDING); only one can.
    it('lets only one of a simultaneous approve and reject through', async () => {
      const results = await Promise.all([
        decide(CR.attendance, 'approve'),
        decide(CR.attendance, 'reject', { reason: 'No' }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const status = await statusOf(CR.attendance);
      expect((await event('EVT-063')).expectedAttendance).toBe(status === ChangeRequestStatus.APPROVED ? 350 : 120);
    });
  });

  describe('access: the assigned Coordinator only', () => {
    // TC-S2-180 · US-37 · setup: base-users + base-venues + tc-s2-159-setup + tc-s2-172-setup · fails if a Coordinator could see or decide a request on an event not assigned to them
    // Code: load() reports a request on someone else's event as not found (404).
    it("hides another Coordinator's request (404)", async () => {
      await review(CR.attendance, 'casey').expect(404);
      await decide(CR.attendance, 'approve', {}, 'casey').expect(404);
      await decide(CR.attendance, 'reject', { reason: 'No' }, 'casey').expect(404);
      expect(await statusOf(CR.attendance)).toBe(ChangeRequestStatus.PENDING);
    });

    // TC-S2-180 · US-37 · setup: base-users + base-venues + tc-s2-159-setup + tc-s2-172-setup · fails if an unknown request returned anything but 404
    // Code: load() answers 404 when no request has that id.
    it('reports an unknown request as not found (404)', async () => {
      await review('does-not-exist').expect(404);
    });

    // TC-S2-180 · US-37 · setup: base-users + base-venues + tc-s2-159-setup + tc-s2-172-setup · fails if an Organiser or Attendee could review change requests
    // Code: the routes are @Roles(EVENT_COORDINATOR), so RolesGuard answers 403.
    it.each(['organiser', 'attendee'] as const)('refuses %s (403)', async (who) => {
      await http().get('/events/change-requests/pending').set('Authorization', as(who)).expect(403);
      await decide(CR.attendance, 'approve', {}, who).expect(403);
    });
  });
});
