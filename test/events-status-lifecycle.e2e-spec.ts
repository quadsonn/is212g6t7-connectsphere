import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-11 (Event status updates automatically as actions are taken),
 * integration tests: one request is taken through the real actions of other
 * stories (US-03/04 submit, US-55 assign, US-09 clarify, US-07 approve,
 * US-08 reject/return, US-24 plan, US-43 cancel) over HTTP, and after each one
 * the status both the Organiser and the assigned Coordinator are shown is
 * checked. Nothing here writes a status directly.
 *
 * Code under test: every action ends in EventsService.setStatus(), the only
 * writer of the status column, which checks the move against the status
 * machine (src/events/event-status.machine.ts); the views build statusView
 * (status, decision and reason, clarification) from the stored row.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql + tc-s1-25-setup.sql (the Coordinator Lead).
 */
describe('US-11 status follows the actions taken (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const USERS = {
    organiser: 'organiser@example.com',
    coordinator: 'coord.a@example.com',
    lead: 'lead@example.com',
  } as const;
  type Who = keyof typeof USERS;
  const COORDINATOR_ID = 'USR-004';

  /** The statuses US-11 AC-1 lists, plus the ones later stories added. */
  const KNOWN_STATUSES = new Set<string>(Object.values(EventStatus));

  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: Who) => `Bearer ${tokens[who]}`;
  const post = (path: string, who: Who, body: object = {}) =>
    http().post(path).set('Authorization', as(who)).send(body);

  const complete = {
    name: 'Lifecycle Gala',
    purpose: 'Purpose',
    description: 'Description',
    category: 'Social',
    proposedStart: '2030-10-01T09:00:00.000Z',
    proposedEnd: '2030-10-01T17:00:00.000Z',
    expectedAttendance: 120,
  };

  /** What each party is shown right now (the Coordinator only once assigned). */
  async function shown(id: string, coordinatorToo: boolean) {
    const organiser = await http().get(`/events/mine/${id}`).set('Authorization', as('organiser')).expect(200);
    expect(organiser.body.statusView.status).toBe(organiser.body.status);
    expect(KNOWN_STATUSES.has(organiser.body.status)).toBe(true);
    if (!coordinatorToo) return { organiser: organiser.body };
    const coordinator = await http().get(`/events/assigned/${id}`).set('Authorization', as('coordinator')).expect(200);
    expect(coordinator.body.status).toBe(organiser.body.status);
    return { organiser: organiser.body, coordinator: coordinator.body };
  }

  /** Draft -> submitted -> assigned by the Lead: the starting point for review. */
  async function submittedAndAssigned() {
    const draft = await post('/events/drafts', 'organiser', complete).expect(201);
    await post(`/events/${draft.body.id}/submit`, 'organiser').expect(200);
    await post(`/assignments/queue/${draft.body.id}/assign`, 'lead', { coordinatorId: COORDINATOR_ID }).expect(200);
    return draft.body.id as string;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');

    prisma = new PrismaClient();

    await resetDb(prisma);
    await loadSql(prisma, 'base-users');
    await loadSql(prisma, 'tc-s1-25-setup');
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
    await loadSql(prisma, 'base-users');
    await loadSql(prisma, 'tc-s1-25-setup');
  });

  describe('AC-1/AC-3: each action moves the status, and both parties see it', () => {
    // TC-S1-88 · US-11 AC-1, AC-3 · setup: base-users + tc-s1-25-setup · fails if any action left a stale or different status for either party
    // Code: saveDraft (DRAFT), submitDraft, askClarification, respondToClarification, approve, startPlanning and
    // EventsCancellationService.cancel each end in setStatus(); both views read the same row.
    it('follows a request from draft to cancelled, showing one status at a time to both parties', async () => {
      const draft = await post('/events/drafts', 'organiser', complete).expect(201);
      const id = draft.body.id as string;
      expect((await shown(id, false)).organiser.status).toBe(EventStatus.DRAFT);

      await post(`/events/${id}/submit`, 'organiser').expect(200);
      expect((await shown(id, false)).organiser.status).toBe(EventStatus.SUBMITTED);

      await post(`/assignments/queue/${id}/assign`, 'lead', { coordinatorId: COORDINATOR_ID }).expect(200);
      expect((await shown(id, true)).coordinator.status).toBe(EventStatus.SUBMITTED);

      await post(`/events/${id}/clarifications`, 'coordinator', { question: 'Indoor or outdoor?' }).expect(201);
      const asked = await shown(id, true);
      expect(asked.organiser.status).toBe(EventStatus.AWAITING_CLARIFICATION);
      expect(asked.organiser.statusView.clarificationRequested).toBe(true);

      await post(`/events/${id}/clarifications/responses`, 'organiser', { response: 'Indoor' }).expect(201);
      expect((await shown(id, true)).organiser.status).toBe(EventStatus.UNDER_REVIEW);

      await post(`/events/${id}/approve`, 'coordinator').expect(200);
      expect((await shown(id, true)).organiser.status).toBe(EventStatus.APPROVED);

      await post(`/events/${id}/start-planning`, 'coordinator').expect(200);
      expect((await shown(id, true)).organiser.status).toBe(EventStatus.PLANNING);

      await post(`/events/${id}/cancel`, 'organiser', { reason: 'Budget withdrawn', confirm: true }).expect(200);
      expect((await shown(id, true)).organiser.status).toBe(EventStatus.CANCELLED);
    });

    // TC-S1-88 · US-11 AC-3 · setup: base-users + tc-s1-25-setup · fails if a return or the resubmission was not reflected
    // Code: returnForAmendment() -> setStatus(RETURNED); the Organiser's submitDraft() -> setStatus(SUBMITTED).
    it('reflects a return for changes and the resubmission', async () => {
      const id = await submittedAndAssigned();

      await post(`/events/${id}/return`, 'coordinator', { reason: 'Add the programme' }).expect(200);
      expect((await shown(id, true)).organiser.status).toBe(EventStatus.RETURNED);

      await post(`/events/${id}/submit`, 'organiser').expect(200);
      expect((await shown(id, true)).organiser.status).toBe(EventStatus.SUBMITTED);
    });

    // TC-S1-88 · US-11 AC-1, AC-3 · setup: base-users + tc-s1-25-setup · fails if a refused action changed, or blanked, the status shown
    // Code: a refused action (no access: 404; no edge in the status machine: 409) throws before setStatus() writes.
    it('leaves the status as it was when an action is refused', async () => {
      const draft = await post('/events/drafts', 'organiser', complete).expect(201);
      const id = draft.body.id as string;

      await post(`/events/${id}/submit`, 'organiser').expect(200);
      // Approving a request nobody has assigned yet, and submitting it twice, are both refused.
      await post(`/events/${id}/approve`, 'coordinator').expect(404);
      await post(`/events/${id}/submit`, 'organiser').expect(409);

      expect((await shown(id, false)).organiser.status).toBe(EventStatus.SUBMITTED);
    });
  });

  describe('AC-2: a rejection is shown with its decision and reason', () => {
    // TC-S1-89 · US-11 AC-2 · setup: base-users + tc-s1-25-setup · fails if a rejected request's status came without the decision or the reason
    // Code: reject() -> setStatus(REJECTED) with decisionReason; statusView.decision carries { outcome, reason }.
    it('shows Rejected with the decision and the reason, to both parties', async () => {
      const id = await submittedAndAssigned();

      await post(`/events/${id}/reject`, 'coordinator', { reason: 'Clashes with exams' }).expect(200);

      const after = await shown(id, true);
      expect(after.organiser.status).toBe(EventStatus.REJECTED);
      expect(after.organiser.statusView.decision).toEqual({ outcome: EventStatus.REJECTED, reason: 'Clashes with exams' });
      expect(after.coordinator.decisionReason).toBe('Clashes with exams');
    });
  });
});
