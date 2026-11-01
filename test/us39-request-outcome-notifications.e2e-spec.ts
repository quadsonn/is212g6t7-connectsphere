import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-39 (Story 39) e2e — the Organiser is told the outcome of their event
 * request: approved, rejected, returned for amendment, or a clarification
 * question.
 *
 * Code under test: EventsService.approve / reject / returnForAmendment
 * (notifyOrganiserOfDecision, EVENT_STATUS_CHANGED) and askClarification
 * (CLARIFICATION_REQUESTED), each raised after the decision commits; the
 * inbox (NotificationsInboxService.list) splits the reason out and links the
 * Organiser to /organiser/<event id> (notification-view.ts linkFor).
 *
 * Pre-condition for every test: reset the testDB, then run base-users.sql;
 * each test loads tc-s1-01-setup.sql (EVT-146 "Freshman Orientation 2030",
 * SUBMITTED, Organiser USR-006, assigned to USR-004).
 */
describe('US-39 request outcome notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const EVENT = 'EVT-146';

  /** Fixed rows from base-users.sql. */
  const USERS = {
    organiser: 'organiser@example.com',
    coordinator: 'coord.a@example.com',
  } as const;
  const tokens: Record<string, string> = {};

  const as = (who: keyof typeof USERS) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

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
    await loadSql(prisma, 'base-users');
    for (const [key, email] of Object.entries(USERS)) {
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
    await loadSql(prisma, 'base-users');
  });

  describe('AC-1 to AC-4: each decision tells the owning Organiser', () => {
    // TC-S3-47, TC-S3-48, TC-S3-49, TC-S3-50 · US-39 AC-1/2/3/4 · setup: base-users + tc-s1-01-setup · fails if a decision notifies no one, notifies anyone but the owning Organiser, drops the event name, outcome or reason, or links nowhere
    // Code: EventsService.approve/reject/returnForAmendment -> notifyOrganiserOfDecision; askClarification -> CLARIFICATION_REQUESTED
    it.each([
      ['approve', 'approve', {}, 200, NotificationType.EVENT_STATUS_CHANGED, 'was approved', null],
      ['reject', 'reject', { reason: 'Clashes with exam week' }, 200, NotificationType.EVENT_STATUS_CHANGED, 'was rejected', 'Clashes with exam week'],
      ['return', 'return', { reason: 'Add the catering numbers' }, 200, NotificationType.EVENT_STATUS_CHANGED, 'was returned for amendment', 'Add the catering numbers'],
      ['clarify', 'clarifications', { question: 'Which hall do you prefer?' }, 201, NotificationType.CLARIFICATION_REQUESTED, 'asked a question', 'Which hall do you prefer?'],
    ] as const)(
      '%s: one notice, to the Organiser only, with the event, outcome, reason and a link',
      async (_label, route, body, status, type, outcome, reason) => {
        await loadSql(prisma, 'tc-s1-01-setup');

        await http()
          .post(`/events/${EVENT}/${route}`)
          .set('Authorization', as('coordinator'))
          .send(body)
          .expect(status);

        // AC-2 and AC-5: exactly one notification in the whole system, to USR-006.
        const all = await prisma.notification.findMany();
        expect(all.map((n) => [n.recipientId, n.type])).toEqual([['USR-006', type]]);

        // AC-3 and AC-4: what the Organiser reads in their inbox.
        const inbox = await http().get('/notifications').set('Authorization', as('organiser')).expect(200);
        expect(inbox.body).toHaveLength(1);
        expect(inbox.body[0].summary).toContain('"Freshman Orientation 2030"');
        expect(inbox.body[0].summary).toContain(outcome);
        expect(inbox.body[0].reason).toBe(reason);
        expect(inbox.body[0].link).toBe(`/organiser/${EVENT}`);
      },
    );
  });

  describe('AC-5: one notification per decision', () => {
    // TC-S3-51 · US-39 AC-5 · setup: base-users + tc-s1-01-setup · fails if repeating a decision sends a second notice
    // Code: EventsService.approve notifies only when the status actually changes; a repeat approve is a no-op (setStatus returns early)
    it('repeating an approve sends nothing more', async () => {
      await loadSql(prisma, 'tc-s1-01-setup');

      await http().post(`/events/${EVENT}/approve`).set('Authorization', as('coordinator')).expect(200);
      await http().post(`/events/${EVENT}/approve`).set('Authorization', as('coordinator')).expect(200);

      expect(await prisma.notification.count()).toBe(1);
    });
  });

  describe('AC-6: saving a draft notifies no one', () => {
    // TC-S3-52 · US-39 AC-6 · setup: base-users · fails if saving a draft raises a notification
    // Code: EventsService.saveDraft raises no notification
    it('saving a draft records no notification', async () => {
      await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({ name: 'Spring Fair (draft)' })
        .expect(201);

      expect(await prisma.notification.count()).toBe(0);
    });
  });
});
