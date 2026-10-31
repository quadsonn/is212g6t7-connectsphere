import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * "Notify Coordinators and Leads when a request needs their attention" — e2e,
 * one describe per acceptance criterion.
 *
 * AC-1  a new request notifies every Coordinator Lead, with a link to it.
 * AC-2  a returned-then-resubmitted request notifies the Leads again.
 * AC-3  a change notifies the assigned Coordinator, else every Lead.
 * AC-4  each notice names the event (a change notice says a change was asked).
 * AC-5  saving or editing a draft notifies no one.
 * AC-6  each notice is recorded at the moment of submission, not on a delay.
 *
 * Code under test: EventsRequestNotifier (EVENT_SUBMITTED to every Lead;
 * EVENT_CHANGE_REQUESTED to the assigned Coordinator, else every Lead), called
 * from EventsService submit and the change-request service.
 *
 * Pre-condition for every test: reset the testDB, then run base-users.sql,
 * tc-s1-25-setup.sql (Leah Lead) and tc-s4-90-setup.sql (Lars Lead). Requests
 * are created through the API in each test.
 */
describe('Request-needs-attention notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  /** Fixed users from base-users, tc-s1-25-setup and tc-s4-90-setup. */
  const ids: Record<string, string> = {
    organiser: 'USR-006',
    lead1: 'USR-012',
    lead2: 'USR-044',
    coordinator: 'USR-004',
  };
  const LOGINS: Record<string, string> = {
    organiser: 'organiser@example.com',
    lead1: 'lead@example.com',
    lead2: 'lead2@example.com',
    coordinator: 'coord.a@example.com',
  };

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  /** A submission far enough in the future to stay valid as the suite ages. */
  const validPayload = (overrides: Record<string, unknown> = {}) => ({
    name: 'Freshman Orientation 2030',
    purpose: 'Welcome new students and introduce campus services',
    description: 'Full-day programme with talks, booths and a closing social',
    category: 'Student engagement',
    proposedStart: '2030-10-01T09:00:00.000Z',
    proposedEnd: '2030-10-01T17:00:00.000Z',
    expectedAttendance: 300,
    ...overrides,
  });

  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  const notificationsFor = (recipientKey: string, type?: NotificationType) =>
    prisma.notification.findMany({
      where: { recipientId: ids[recipientKey], ...(type ? { type } : {}) },
    });

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
    await given('base-users', 'tc-s1-25-setup', 'tc-s4-90-setup');
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
    await given('base-users', 'tc-s1-25-setup', 'tc-s4-90-setup');
  });

  /** Submit a brand-new request and return its id. */
  const submitNewRequest = async (overrides: Record<string, unknown> = {}) => {
    const res = await http()
      .post('/events')
      .set('Authorization', as('organiser'))
      .send(validPayload(overrides))
      .expect(201);
    return res.body.id as string;
  };

  describe('AC-1: a new request notifies every Coordinator Lead', () => {
    // TC-S4-90, TC-S4-93 · US-63 AC-1, AC-4 · setup: base-users + tc-s1-25-setup + tc-s4-90-setup · fails if a new or submitted-draft request does not notify every Lead, notifies a plain Coordinator, or the notice does not name and link the event
    // Code: EventsService create/submit -> EventsRequestNotifier.submitted (EVENT_SUBMITTED to every Lead)
    it('records one EVENT_SUBMITTED notice per Lead, and none for a Coordinator', async () => {
      const eventId = await submitNewRequest();

      const lead1 = await notificationsFor('lead1', NotificationType.EVENT_SUBMITTED);
      const lead2 = await notificationsFor('lead2', NotificationType.EVENT_SUBMITTED);
      expect(lead1).toHaveLength(1);
      expect(lead2).toHaveLength(1);

      // A plain Coordinator is not a Lead and picks up work by assignment, not
      // by this notice.
      expect(await notificationsFor('coordinator', NotificationType.EVENT_SUBMITTED)).toHaveLength(
        0,
      );

      // AC-4 + "links to the request": the notice names the event and carries
      // the id the notification page turns into a link.
      expect(lead1[0].relatedEventId).toBe(eventId);
      expect(lead1[0].message).toContain('Freshman Orientation 2030');
    });

    // TC-S4-90, TC-S4-93 · US-63 AC-1, AC-4 · setup: base-users + tc-s1-25-setup + tc-s4-90-setup · fails if a new or submitted-draft request does not notify every Lead, notifies a plain Coordinator, or the notice does not name and link the event
    // Code: EventsService create/submit -> EventsRequestNotifier.submitted (EVENT_SUBMITTED to every Lead)
    it('notifies Leads when a draft is submitted via POST /events/:id/submit', async () => {
      const draft = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send(validPayload())
        .expect(201);

      // No notice yet — saving the draft must stay silent (see AC-5).
      expect(await notificationsFor('lead1', NotificationType.EVENT_SUBMITTED)).toHaveLength(0);

      await http()
        .post(`/events/${draft.body.id}/submit`)
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(await notificationsFor('lead1', NotificationType.EVENT_SUBMITTED)).toHaveLength(1);
      expect(await notificationsFor('lead2', NotificationType.EVENT_SUBMITTED)).toHaveLength(1);
    });
  });

  describe('AC-5: drafts notify no one', () => {
    // TC-S4-94 · US-63 AC-5 · setup: base-users + tc-s1-25-setup + tc-s4-90-setup · fails if saving or editing a draft notifies anyone
    // Code: EventsService draft save/edit (no notifier call)
    it('saving a draft records no notification', async () => {
      await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send(validPayload())
        .expect(201);

      expect(await prisma.notification.count()).toBe(0);
    });

    // TC-S4-94 · US-63 AC-5 · setup: base-users + tc-s1-25-setup + tc-s4-90-setup · fails if saving or editing a draft notifies anyone
    // Code: EventsService draft save/edit (no notifier call)
    it('editing a draft records no notification', async () => {
      const draft = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send(validPayload())
        .expect(201);

      await http()
        .patch(`/events/${draft.body.id}`)
        .set('Authorization', as('organiser'))
        .send({ name: 'Freshman Orientation 2030 (revised)' })
        .expect(200);

      expect(await prisma.notification.count()).toBe(0);
    });
  });

  describe('AC-2: each resubmission counts', () => {
    // TC-S4-91 · US-63 AC-2 · setup: base-users + tc-s1-25-setup + tc-s4-90-setup · fails if a request returned and submitted again does not notify the Leads again
    // Code: EventsService.submit -> EventsRequestNotifier.submitted (every submission)
    it('notifies the Leads again after a return and resubmission', async () => {
      const eventId = await submitNewRequest();
      expect(await notificationsFor('lead1', NotificationType.EVENT_SUBMITTED)).toHaveLength(1);

      // A Lead assigns it so a Coordinator can send it back.
      await http()
        .post(`/assignments/queue/${eventId}/assign`)
        .set('Authorization', as('lead1'))
        .send({ coordinatorId: ids.coordinator })
        .expect(200);

      await http()
        .post(`/events/${eventId}/return`)
        .set('Authorization', as('coordinator'))
        .send({ reason: 'Please add the expected catering requirements.' })
        .expect(200);

      // The Organiser addresses it and submits the same request again.
      await http()
        .post(`/events/${eventId}/submit`)
        .set('Authorization', as('organiser'))
        .expect(200);

      // Each submission counts: the first plus the resubmission.
      expect(await notificationsFor('lead1', NotificationType.EVENT_SUBMITTED)).toHaveLength(2);
      expect(await notificationsFor('lead2', NotificationType.EVENT_SUBMITTED)).toHaveLength(2);
    });
  });

  describe('AC-3/AC-4: a change notifies the right recipients, and says a change was asked', () => {
    // TC-S4-92, TC-S4-93 · US-63 AC-3, AC-4 · setup: base-users + tc-s1-25-setup + tc-s4-90-setup · fails if a change does not reach the assigned Coordinator (or every Lead when unassigned), reaches the wrong people, or does not say a change was requested
    // Code: EventsChangeRequestService.request -> EventsRequestNotifier.changeRequested (EVENT_CHANGE_REQUESTED)
    it('notifies the assigned Coordinator — and no Lead — when the event is assigned', async () => {
      const eventId = await submitNewRequest();
      await http()
        .post(`/assignments/queue/${eventId}/assign`)
        .set('Authorization', as('lead1'))
        .send({ coordinatorId: ids.coordinator })
        .expect(200);

      // Kept by design: only count the change notices from here on.
      await prisma.notification.deleteMany({
        where: { type: NotificationType.EVENT_CHANGE_REQUESTED },
      });

      await http()
        .post(`/events/${eventId}/change-requests`)
        .set('Authorization', as('organiser'))
        .send({ reason: 'We now expect more attendees.', proposedAttendance: 450 })
        .expect(201);

      const coordinator = await notificationsFor(
        'coordinator',
        NotificationType.EVENT_CHANGE_REQUESTED,
      );
      expect(coordinator).toHaveLength(1);
      expect(coordinator[0].relatedEventId).toBe(eventId);
      // AC-4: the notice names the event and says a change was requested.
      expect(coordinator[0].message).toMatch(/change/i);
      expect(coordinator[0].message).toContain('Freshman Orientation 2030');

      expect(
        await notificationsFor('lead1', NotificationType.EVENT_CHANGE_REQUESTED),
      ).toHaveLength(0);
    });

    // TC-S4-92, TC-S4-93 · US-63 AC-3, AC-4 · setup: base-users + tc-s1-25-setup + tc-s4-90-setup · fails if a change does not reach the assigned Coordinator (or every Lead when unassigned), reaches the wrong people, or does not say a change was requested
    // Code: EventsChangeRequestService.request -> EventsRequestNotifier.changeRequested (EVENT_CHANGE_REQUESTED)
    it('falls back to every Lead when the event has no assigned Coordinator', async () => {
      const eventId = await submitNewRequest();

      await http()
        .post(`/events/${eventId}/change-requests`)
        .set('Authorization', as('organiser'))
        .send({ reason: 'We now expect more attendees.', proposedAttendance: 450 })
        .expect(201);

      expect(
        await notificationsFor('lead1', NotificationType.EVENT_CHANGE_REQUESTED),
      ).toHaveLength(1);
      expect(
        await notificationsFor('lead2', NotificationType.EVENT_CHANGE_REQUESTED),
      ).toHaveLength(1);
      // No Coordinator is assigned, so none is notified.
      expect(
        await notificationsFor('coordinator', NotificationType.EVENT_CHANGE_REQUESTED),
      ).toHaveLength(0);
    });
  });

  describe('AC-6: sent at the moment of submission', () => {
    // TC-S4-95 · US-63 AC-6 · setup: base-users + tc-s1-25-setup + tc-s4-90-setup · fails if the notice is recorded later than the submission that caused it
    // Code: EventsRequestNotifier.submitted (called in the submission request)
    it('records the notice within the submission request, not later', async () => {
      const before = new Date();
      const eventId = await submitNewRequest();
      const after = new Date();

      const [notice] = await notificationsFor('lead1', NotificationType.EVENT_SUBMITTED);
      expect(notice.relatedEventId).toBe(eventId);
      expect(notice.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(notice.createdAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
    });
  });
});
