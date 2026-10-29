import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, NotificationType, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * Event Coordinator Lead e2e — the unassigned queue, assignment, the
 * assignments view and reassignment (Stories 55 and 56).
 *
 * Code under test: AssignmentsController / AssignmentsService (queue,
 * queued, coordinators, assign, overview, reassign), the Coordinator's
 * assigned-events views, change history and notifications.
 *
 * Pre-condition for every test: reset the testDB, then run
 * tc-s3-159-setup.sql (Olive, Lena the Lead, Marcus and Fatima the only two
 * Coordinators, and Vic of Venue Staff). base-users.sql is not loaded: its two
 * Coordinators would join every Coordinator list.
 */
describe('Event Coordinator Lead: queue, assignment and reassignment (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  /** Fixed users from tc-s3-159-setup. */
  const ids: Record<string, string> = {
    organiser: 'USR-028',
    lead: 'USR-029',
    marcus: 'USR-030',
    fatima: 'USR-031',
    venueStaff: 'USR-032',
  };
  const LOGINS: Record<string, string> = {
    organiser: 'olive@example.com',
    lead: 'lena@example.com',
    marcus: 'marcus@example.com',
    fatima: 'fatima@example.com',
    venueStaff: 'venue@example.com',
  };

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  /** Events from tc-s3-160 (queued) and tc-s3-170 (Marcus, in planning). */
  const queuedEvent = { id: 'EVT-283', name: 'Freshman Orientation 2030' };
  const marcusEvent = { id: 'EVT-296', name: 'Freshman Orientation 2030' };
  /** tc-s3-171: Marcus's closed events. */
  const CLOSED: Record<string, string> = {
    [EventStatus.COMPLETED]: 'EVT-297',
    [EventStatus.CANCELLED]: 'EVT-298',
    [EventStatus.REJECTED]: 'EVT-299',
  };

  const queue = (who = 'lead') =>
    http().get('/assignments/queue').set('Authorization', as(who));
  const queued = (id: string, who = 'lead') =>
    http().get(`/assignments/queue/${id}`).set('Authorization', as(who));
  const assign = (id: string, coordinatorId: string, who = 'lead') =>
    http()
      .post(`/assignments/queue/${id}/assign`)
      .set('Authorization', as(who))
      .send({ coordinatorId });
  const overview = (query = '', who = 'lead') =>
    http().get(`/assignments${query}`).set('Authorization', as(who));
  const reassign = (id: string, coordinatorId: string, who = 'lead') =>
    http()
      .post(`/assignments/events/${id}/reassign`)
      .set('Authorization', as(who))
      .send({ coordinatorId });

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
    await given('tc-s3-159-setup');
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
    await given('tc-s3-159-setup');
  });

  describe('a newly submitted request goes into the unassigned queue', () => {
    // TC-S3-159 · US-55 AC-1 · setup: tc-s3-159-setup · fails if a submitted request is assigned directly, or drafts and assigned requests are queued
    // Code: EventsService submit (coordinatorId null); EventsAssignmentService.listQueue
    it('is unassigned when the Organiser submits it', async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send({
          name: 'Careers Fair',
          purpose: 'Meet employers',
          description: 'Stalls and talks',
          category: 'Careers',
          proposedStart: '2030-11-01T09:00:00.000Z',
          proposedEnd: '2030-11-01T17:00:00.000Z',
          expectedAttendance: 199,
        })
        .expect(201);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(stored.coordinatorId).toBeNull();
      expect(stored.status).toBe(EventStatus.SUBMITTED);
      expect(stored.submittedAt).toBeInstanceOf(Date);

      const list = await queue().expect(200);
      expect(list.body.map((e: { id: string }) => e.id)).toEqual([res.body.id]);
    });

    // TC-S3-159 · US-55 AC-1 · setup: tc-s3-159-setup + tc-s3-159b-setup · fails if a submitted request is assigned directly, or drafts and assigned requests are queued
    // Code: EventsService submit (coordinatorId null); EventsAssignmentService.listQueue
    it('does not list drafts or already-assigned requests', async () => {
      await given('tc-s3-159b-setup');

      const res = await queue().expect(200);

      expect(res.body).toEqual([]);
    });
  });

  describe('only the Lead can view the queue', () => {
    // TC-S3-160 · US-55 AC-2 · setup: tc-s3-159-setup + tc-s3-160-setup · fails if a Coordinator or other role can see the queue, open from it or assign
    // Code: EventsAssignmentController @Roles(EVENT_COORDINATOR_LEAD); JwtAuthGuard
    it('refuses every other role, Coordinators included', async () => {
      await given('tc-s3-160-setup');
      const event = queuedEvent;

      for (const who of ['marcus', 'fatima', 'organiser', 'venueStaff']) {
        await queue(who).expect(403);
        await queued(event.id, who).expect(403);
        await assign(event.id, ids.marcus, who).expect(403);
      }
    });

    // TC-S3-160 · US-55 AC-2 · setup: tc-s3-159-setup · fails if a Coordinator or other role can see the queue, open from it or assign
    // Code: EventsAssignmentController @Roles(EVENT_COORDINATOR_LEAD); JwtAuthGuard
    it('requires authentication', async () => {
      await http().get('/assignments/queue').expect(401);
    });
  });

  describe('each queue entry shows the review details, oldest first', () => {
    // TC-S3-161 · US-55 AC-3 · setup: tc-s3-159-setup + tc-s3-160-setup · fails if an entry misses a field or the oldest submission is not first
    // Code: EventsAssignmentService.listQueue -> toQueueEntry (order by submittedAt)
    it('lists event, Organiser, organisation, category, date, attendance and submission time', async () => {
      await given('tc-s3-160-setup');
      const event = queuedEvent;

      const res = await queue().expect(200);

      expect(res.body).toEqual([
        {
          id: event.id,
          name: 'Freshman Orientation 2030',
          organiser: { id: ids.organiser, name: 'Olive', email: 'olive@example.com' },
          organisation: 'Acme Corp',
          category: 'Student engagement',
          proposedStart: '2030-10-01T09:00:00.000Z',
          proposedEnd: '2030-10-01T17:00:00.000Z',
          expectedAttendance: 99,
          submittedAt: '2030-01-01T00:00:00.000Z',
        },
      ]);
    });

    // TC-S3-161 · US-55 AC-3 · setup: tc-s3-159-setup + tc-s3-161-setup · fails if an entry misses a field or the oldest submission is not first
    // Code: EventsAssignmentService.listQueue -> toQueueEntry (order by submittedAt)
    it('lists the oldest submission first', async () => {
      await given('tc-s3-161-setup');
      const [newest, oldest, middle] = [{ id: 'EVT-284' }, { id: 'EVT-285' }, { id: 'EVT-286' }];

      const res = await queue().expect(200);

      expect(res.body.map((e: { id: string }) => e.id)).toEqual([
        oldest.id,
        middle.id,
        newest.id,
      ]);
    });
  });

  describe('a queued request can be opened before assigning', () => {
    // TC-S3-162 · US-55 AC-4 · setup: tc-s3-159-setup + tc-s3-160-setup + tc-s3-162-setup · fails if a queued request cannot be opened, or one that has left the queue can
    // Code: EventsAssignmentService.getQueuedRequest
    it('shows its basic event information', async () => {
      await given('tc-s3-160-setup', 'tc-s3-162-setup');
      const event = queuedEvent;

      const res = await queued(event.id).expect(200);

      expect(res.body).toMatchObject({
        id: event.id,
        name: 'Freshman Orientation 2030',
        purpose: 'Welcome new students',
        description: 'Full-day programme',
        status: 'SUBMITTED',
        preferredLayout: 'THEATRE',
        layoutNotes: 'Stage left',
        organisation: 'Acme Corp',
      });
    });

    // TC-S3-162 · US-55 AC-4 · setup: tc-s3-159-setup + tc-s3-160-setup + tc-s3-162b-setup · fails if a queued request cannot be opened, or one that has left the queue can
    // Code: EventsAssignmentService.getQueuedRequest
    it('does not open a request that has left the queue', async () => {
      await given('tc-s3-160-setup', 'tc-s3-162b-setup');
      const event = queuedEvent;

      await queued(event.id).expect(404);
    });
  });

  describe('the Lead picks from the active Event Coordinators', () => {
    // TC-S3-163 · US-55 AC-5 · setup: tc-s3-159-setup · fails if the list offers anyone but active Coordinators, or a non-Coordinator can be assigned
    // Code: EventsAssignmentService.listCoordinators; assertIsCoordinator
    it('lists Coordinators only', async () => {
      const res = await http()
        .get('/assignments/coordinators')
        .set('Authorization', as('lead'))
        .expect(200);

      expect(res.body.map((c: { name: string }) => c.name)).toEqual(['Fatima', 'Marcus']);
    });

    // TC-S3-163 · US-55 AC-5 · setup: tc-s3-159-setup + tc-s3-160-setup · fails if the list offers anyone but active Coordinators, or a non-Coordinator can be assigned
    // Code: EventsAssignmentService.listCoordinators; assertIsCoordinator
    it('refuses a target who is not a Coordinator', async () => {
      await given('tc-s3-160-setup');
      const event = queuedEvent;

      await assign(event.id, ids.venueStaff).expect(400);
      await assign(event.id, ids.lead).expect(400);
      await assign(event.id, 'no-such-user').expect(404);
    });
  });

  describe('assigning', () => {
    // TC-S3-164 · US-55 AC-6 · setup: tc-s3-159-setup + tc-s3-160-setup · fails if the request stays in the queue or does not appear in the chosen Coordinator's list only
    // Code: EventsAssignmentService.assign; EventsService.findAssignedRequests
    it('removes the request from the queue and puts it in that Coordinator’s list', async () => {
      await given('tc-s3-160-setup');
      const event = queuedEvent;

      const res = await assign(event.id, ids.marcus).expect(200);

      expect(res.body.coordinator).toEqual({
        id: ids.marcus,
        name: 'Marcus',
        email: 'marcus@example.com',
      });
      expect(res.body.status).toBe('SUBMITTED');

      expect((await queue().expect(200)).body).toEqual([]);

      const mine = await http()
        .get('/events/assigned')
        .set('Authorization', as('marcus'))
        .expect(200);
      expect(mine.body.map((e: { id: string }) => e.id)).toEqual([event.id]);

      const others = await http()
        .get('/events/assigned')
        .set('Authorization', as('fatima'))
        .expect(200);
      expect(others.body).toEqual([]);
    });

    // TC-S3-164 · US-55 AC-6 · setup: tc-s3-159-setup + tc-s3-160-setup · fails if the assignment is not recorded in the change history with who, to whom and when
    // Code: EventsAssignmentService.assign -> swapCoordinator (EventChange)
    it('records who assigned it, to whom and when in the change history', async () => {
      await given('tc-s3-160-setup');
      const event = queuedEvent;
      await assign(event.id, ids.marcus).expect(200);

      const res = await http()
        .get(`/events/${event.id}/history`)
        .set('Authorization', as('marcus'))
        .expect(200);

      expect(res.body.entries).toHaveLength(1);
      expect(res.body.entries[0]).toMatchObject({
        changedBy: { id: ids.lead, name: 'Lena', role: 'EVENT_COORDINATOR_LEAD' },
        changes: [{ field: 'coordinator', previous: null, next: 'Marcus' }],
      });
      expect(Date.parse(res.body.entries[0].createdAt)).not.toBeNaN();
    });

    // TC-S3-165, TC-S4-100 · US-55 AC-7, US-65 AC-1 · setup: tc-s3-159-setup + tc-s3-160-setup · fails if the assigned Coordinator is not notified
    // Code: EventsAssignmentService.assign -> notifications (EVENT_ASSIGNED)
    it('notifies the assigned Coordinator', async () => {
      await given('tc-s3-160-setup');
      const event = queuedEvent;
      await assign(event.id, ids.marcus).expect(200);

      const notes = await prisma.notification.findMany({
        where: { relatedEventId: event.id },
      });

      expect(notes.map((n) => [n.recipientId, n.type]).sort()).toEqual(
        [
          [ids.marcus, NotificationType.EVENT_ASSIGNED],
          // US-65: and the Organiser.
          [ids.organiser, NotificationType.COORDINATOR_ASSIGNED],
        ].sort(),
      );
    });

    // TC-S4-100 · US-65 AC-1 · setup: tc-s3-159-setup + tc-s3-160-setup · fails if the Organiser is not told, in their inbox, the name of the Coordinator assigned
    // Code: EventsAssignmentService.assign -> notifySafely (COORDINATOR_ASSIGNED to the Organiser)
    it('US-65: tells the Organiser who their coordinator now is, in their inbox', async () => {
      await given('tc-s3-160-setup');
      const event = queuedEvent;
      await assign(event.id, ids.marcus).expect(200);

      const inbox = await http().get('/notifications').set('Authorization', as('organiser')).expect(200);

      expect(inbox.body).toHaveLength(1);
      expect(inbox.body[0]).toMatchObject({
        type: 'COORDINATOR_ASSIGNED',
        summary: `Marcus is now the coordinator for "${event.name}".`,
        link: `/organiser/${event.id}`,
      });
    });

    // TC-S3-167 · US-55 AC-9 · setup: tc-s3-159-setup + tc-s3-160-setup · fails if an assigned request can be assigned again, or the current assignee is not shown
    // Code: EventsAssignmentService.assign -> alreadyAssigned (409, currentAssignee)
    it('blocks an already-assigned request and shows the current assignee', async () => {
      await given('tc-s3-160-setup');
      const event = queuedEvent;
      await assign(event.id, ids.marcus).expect(200);

      const res = await assign(event.id, ids.fatima).expect(409);

      expect(res.body.currentAssignee).toEqual({
        id: ids.marcus,
        name: 'Marcus',
        email: 'marcus@example.com',
      });
      const stored = await prisma.eventRequest.findUniqueOrThrow({ where: { id: event.id } });
      expect(stored.coordinatorId).toBe(ids.marcus);
    });

    // TC-S3-167, TC-S4-100 · US-55 AC-9, US-65 AC-1 · setup: tc-s3-159-setup + tc-s3-160-setup · fails if a refused second assignment notifies anyone again
    // Code: EventsAssignmentService.assign -> alreadyAssigned (no notice)
    it('US-65 AC1: Given the event is already assigned, When a Lead assigns it again, Then the Organiser is not notified again', async () => {
      await given('tc-s3-160-setup');
      const event = queuedEvent;
      await assign(event.id, ids.marcus).expect(200);

      await assign(event.id, ids.fatima).expect(409);

      const toOrganiser = await prisma.notification.findMany({
        where: { relatedEventId: event.id, recipientId: ids.organiser },
      });
      // Only the first, successful assignment's notice.
      expect(toOrganiser).toHaveLength(1);
      expect(toOrganiser[0].message).toBe(`Marcus is now the coordinator for "${event.name}".`);
    });

    // TC-S3-167 · US-55 AC-9 · setup: tc-s3-159-setup + tc-s3-160-setup · fails if two simultaneous assignments both succeed
    // Code: EventsAssignmentService.assign (conditional update on coordinatorId null)
    it('lets only one of two simultaneous assignments win', async () => {
      await given('tc-s3-160-setup');
      const event = queuedEvent;

      const results = await Promise.all([
        assign(event.id, ids.marcus),
        assign(event.id, ids.fatima),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const history = await prisma.eventChange.count({ where: { eventId: event.id } });
      expect(history).toBe(1);
    });

    // TC-S3-163 · US-55 AC-5 · setup: tc-s3-159-setup + tc-s3-159b-setup · fails if a draft can be assigned
    // Code: EventsAssignmentService.assign (queued requests only, 404)
    it('does not assign a draft', async () => {
      await given('tc-s3-159b-setup');
      const draft = { id: 'EVT-281' };

      await assign(draft.id, ids.marcus).expect(404);
    });
  });

  describe('a request still in the queue cannot be reviewed or edited by any Coordinator', () => {
    // TC-S3-166 · US-55 AC-8 · setup: tc-s3-159-setup + tc-s3-160-setup · fails if a Coordinator can see, review or edit a request still in the queue
    // Code: EventsService.findAssignedRequest(s) and review actions (assigned Coordinator only, 404)
    it('is invisible and untouchable to Coordinators', async () => {
      await given('tc-s3-160-setup');
      const event = queuedEvent;

      for (const who of ['marcus', 'fatima']) {
        const list = await http()
          .get('/events/assigned')
          .set('Authorization', as(who))
          .expect(200);
        expect(list.body).toEqual([]);

        await http().get(`/events/assigned/${event.id}`).set('Authorization', as(who)).expect(404);
        await http().get(`/events/${event.id}`).set('Authorization', as(who)).expect(404);
        await http().post(`/events/${event.id}/approve`).set('Authorization', as(who)).expect(404);
        await http()
          .post(`/events/${event.id}/reject`)
          .set('Authorization', as(who))
          .send({ reason: 'no' })
          .expect(404);
        await http()
          .post(`/events/${event.id}/start-planning`)
          .set('Authorization', as(who))
          .expect(404);
      }

      const stored = await prisma.eventRequest.findUniqueOrThrow({ where: { id: event.id } });
      expect(stored.status).toBe(EventStatus.SUBMITTED);
    });
  });

  describe('Coordinators can no longer assign or reassign themselves', () => {
    // TC-S3-176 · US-56 AC-9 · setup: tc-s3-159-setup + tc-s3-170-setup · fails if a Coordinator can still assign or reassign themselves
    // Code: EventsAssignmentController (Lead-only); old Coordinator routes removed
    it('removes the Coordinator-side routes', async () => {
      await given('tc-s3-170-setup');
      const event = marcusEvent;

      await http()
        .patch(`/events/${event.id}/coordinator`)
        .set('Authorization', as('marcus'))
        .send({ coordinatorId: ids.fatima })
        .expect(404);
      await http()
        .post(`/events/${event.id}/reassign`)
        .set('Authorization', as('marcus'))
        .send({ coordinatorId: ids.fatima })
        .expect(404);
      await reassign(event.id, ids.fatima, 'marcus').expect(403);
    });
  });

  describe('the assignments view', () => {
    // TC-S3-168 · US-56 AC-1 · setup: tc-s3-159-setup + tc-s3-168-setup · fails if a Coordinator, an active event, the event fields or the count is missing, or a closed or queued event is counted
    // Code: EventsAssignmentService.listAssignments
    it('lists every Coordinator with their active events and a count', async () => {
      await given('tc-s3-168-setup');
      const [a, b] = [{ id: 'EVT-288' }, { id: 'EVT-289' }];
      // Unassigned requests (EVT-293) belong to the queue, not to any Coordinator.

      const res = await overview().expect(200);

      expect(res.body.map((c: { coordinator: { name: string } }) => c.coordinator.name)).toEqual([
        'Fatima',
        'Marcus',
      ]);
      expect(res.body[0]).toMatchObject({ activeCount: 0, events: [] });
      expect(res.body[1].activeCount).toBe(2);
      expect(res.body[1].events).toEqual([
        { id: b.id, name: 'Sooner', status: 'CONFIRMED', eventDate: '2030-11-01T09:00:00.000Z' },
        { id: a.id, name: 'Later', status: 'PLANNING', eventDate: '2030-12-01T09:00:00.000Z' },
      ]);
    });

    // TC-S3-169 · US-56 AC-2 · setup: tc-s3-159-setup + tc-s3-169-setup · fails if the filter shows other Coordinators or accepts a non-Coordinator
    // Code: EventsAssignmentService.listAssignments (coordinatorId filter, assertIsCoordinator)
    it('filters by Coordinator', async () => {
      await given('tc-s3-169-setup');

      const res = await overview(`?coordinatorId=${ids.fatima}`).expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].coordinator.id).toBe(ids.fatima);
      expect(res.body[0].activeCount).toBe(1);

      await overview(`?coordinatorId=${ids.venueStaff}`).expect(400);
    });

    // TC-S3-176 · US-56 AC-9 · setup: tc-s3-159-setup + tc-s3-169-setup · fails if anyone but the Lead sees all assignments, or a Coordinator sees another's events
    // Code: EventsAssignmentController @Roles(EVENT_COORDINATOR_LEAD); EventsService.findAssignedRequests
    it('is Lead-only; a Coordinator sees only their own events', async () => {
      await given('tc-s3-169-setup');

      for (const who of ['marcus', 'organiser', 'venueStaff']) {
        await overview('', who).expect(403);
      }

      const mine = await http()
        .get('/events/assigned')
        .set('Authorization', as('marcus'))
        .expect(200);
      expect(mine.body).toHaveLength(1);
      expect(mine.body[0].coordinatorId).toBe(ids.marcus);
    });
  });

  describe('reassigning', () => {
    // TC-S3-172 · US-56 AC-5 · setup: tc-s3-159-setup + tc-s3-170-setup · fails if the previous Coordinator can still view or manage the event, or the new one cannot
    // Code: EventsAssignmentService.reassign -> swapCoordinator
    it('moves the event: the previous Coordinator loses it and the new one gains it', async () => {
      await given('tc-s3-170-setup');
      const event = marcusEvent;

      const res = await reassign(event.id, ids.fatima).expect(200);
      expect(res.body.coordinator.id).toBe(ids.fatima);

      await http().get(`/events/assigned/${event.id}`).set('Authorization', as('marcus')).expect(404);
      await http().post(`/events/${event.id}/approve`).set('Authorization', as('marcus')).expect(404);
      await http().get(`/events/assigned/${event.id}`).set('Authorization', as('fatima')).expect(200);
    });

    // TC-S3-170 · US-56 AC-3 · setup: tc-s3-159-setup + tc-s3-170-setup · fails if an event can be reassigned to its current Coordinator
    // Code: EventsAssignmentService.reassign (same Coordinator, 400)
    it('blocks reassigning to the current Coordinator', async () => {
      await given('tc-s3-170-setup');
      const event = marcusEvent;

      await reassign(event.id, ids.marcus).expect(400);
    });

    // TC-S3-171 · US-56 AC-4 · setup: tc-s3-159-setup + tc-s3-171-setup · fails if a completed, cancelled or rejected event can be reassigned
    // Code: EventsAssignmentService.reassign (closed statuses, 409)
    it.each([EventStatus.COMPLETED, EventStatus.CANCELLED, EventStatus.REJECTED])(
      'blocks a %s event',
      async (status) => {
        await given('tc-s3-171-setup');
        const event = { id: CLOSED[status] };

        await reassign(event.id, ids.fatima).expect(409);

        const stored = await prisma.eventRequest.findUniqueOrThrow({ where: { id: event.id } });
        expect(stored.coordinatorId).toBe(ids.marcus);
      },
    );

    // TC-S3-170 · US-56 AC-3 · setup: tc-s3-159-setup + tc-s3-160-setup · fails if a queued request can be reassigned instead of assigned
    // Code: EventsAssignmentService.reassign (unassigned, 409)
    it('refers an unassigned request back to the queue', async () => {
      await given('tc-s3-160-setup');
      const event = queuedEvent;

      await reassign(event.id, ids.fatima).expect(409);
    });

    // TC-S3-173 · US-56 AC-6 · setup: tc-s3-159-setup + tc-s3-170-setup + tc-s3-173-setup · fails if bookings, comments or status change on reassignment, or pending change requests stay with the previous Coordinator
    // Code: EventsAssignmentService.reassign -> swapCoordinator (coordinatorId only)
    it('leaves bookings, reservations and comments untouched, and moves pending change requests', async () => {
      await given('tc-s3-170-setup', 'tc-s3-173-setup');
      const event = marcusEvent;
      const booking = { id: 'BKG-160' };
      const message = { id: 'CLM-001' };
      const pending = (who: string) =>
        http().get('/events/change-requests/pending').set('Authorization', as(who));
      expect((await pending('marcus').expect(200)).body).toHaveLength(1);
      expect((await pending('fatima').expect(200)).body).toHaveLength(0);

      await reassign(event.id, ids.fatima).expect(200);

      expect((await pending('marcus').expect(200)).body).toHaveLength(0);
      expect((await pending('fatima').expect(200)).body).toHaveLength(1);

      expect(
        await prisma.venueBooking.findUniqueOrThrow({ where: { id: booking.id } }),
      ).toMatchObject({ requestedById: ids.marcus, status: 'REQUESTED' });
      expect(
        await prisma.clarificationMessage.findUniqueOrThrow({ where: { id: message.id } }),
      ).toMatchObject({ body: 'A question' });
      const stored = await prisma.eventRequest.findUniqueOrThrow({ where: { id: event.id } });
      expect(stored.status).toBe(EventStatus.PLANNING);
    });

    // TC-S3-174 · US-56 AC-7 · setup: tc-s3-159-setup + tc-s3-160-setup · fails if the reassignment is not recorded with who, from and to, or earlier entries are lost
    // Code: EventsAssignmentService.reassign -> swapCoordinator (EventChange)
    it('records who, from and to in the change history, and keeps earlier entries', async () => {
      await given('tc-s3-160-setup');
      const event = queuedEvent;
      await assign(event.id, ids.marcus).expect(200);
      await reassign(event.id, ids.fatima).expect(200);

      const res = await http()
        .get(`/events/${event.id}/history`)
        .set('Authorization', as('fatima'))
        .expect(200);

      expect(res.body.entries.map((e: { changes: unknown }) => e.changes)).toEqual([
        [{ field: 'coordinator', previous: null, next: 'Marcus' }],
        [{ field: 'coordinator', previous: 'Marcus', next: 'Fatima' }],
      ]);
      expect(res.body.entries[1].changedBy.id).toBe(ids.lead);
    });

    // TC-S3-175, TC-S4-101 · US-56 AC-8, US-65 AC-2 · setup: tc-s3-159-setup + tc-s3-170-setup · fails if the previous or new Coordinator is not notified
    // Code: EventsAssignmentService.reassign -> notifications (EVENT_REASSIGNED)
    it('notifies both the previous and the new Coordinator', async () => {
      await given('tc-s3-170-setup');
      const event = marcusEvent;
      await reassign(event.id, ids.fatima).expect(200);

      const notes = await prisma.notification.findMany({
        where: { relatedEventId: event.id },
      });

      expect(notes.map((n) => [n.recipientId, n.type]).sort()).toEqual(
        [
          [ids.marcus, NotificationType.EVENT_REASSIGNED],
          [ids.fatima, NotificationType.EVENT_REASSIGNED],
          // US-65: and the Organiser, with the new coordinator's name.
          [ids.organiser, NotificationType.COORDINATOR_ASSIGNED],
        ].sort(),
      );
      const toOrganiser = notes.find((n) => n.recipientId === ids.organiser);
      expect(toOrganiser?.message).toBe(`Your coordinator for "${event.name}" is now Fatima.`);
    });

    // TC-S3-176 · US-56 AC-9 · setup: tc-s3-159-setup + tc-s3-170-setup · fails if anyone but the Lead can reassign
    // Code: EventsAssignmentController @Roles(EVENT_COORDINATOR_LEAD)
    it('is Lead-only', async () => {
      await given('tc-s3-170-setup');
      const event = marcusEvent;

      for (const who of ['marcus', 'fatima', 'organiser', 'venueStaff']) {
        await reassign(event.id, ids.fatima, who).expect(403);
      }
    });
  });
});
