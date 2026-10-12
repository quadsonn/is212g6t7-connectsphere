import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ChangeRequestStatus,
  EventStatus,
  NotificationType,
  PrismaClient,
  Role,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';

/**
 * Event Coordinator Lead e2e — the unassigned queue, assignment, the
 * assignments view and reassignment.
 */
describe('Event Coordinator Lead: queue, assignment and reassignment (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const seedUser = async (
    key: string,
    email: string,
    role: Role,
    name = key,
    organisation: string | null = null,
  ) => {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        name,
        role,
        organisation,
      },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  const seedEvent = (overrides: Record<string, unknown> = {}) =>
    prisma.eventRequest.create({
      data: {
        organiserId: ids.organiser,
        coordinatorId: null,
        name: 'Freshman Orientation 2030',
        purpose: 'Welcome new students',
        description: 'Full-day programme',
        category: 'Student engagement',
        proposedStart: new Date('2030-10-01T09:00:00Z'),
        proposedEnd: new Date('2030-10-01T17:00:00Z'),
        expectedAttendance: 99,
        status: EventStatus.SUBMITTED,
        submittedAt: new Date('2030-01-01T00:00:00Z'),
        ...overrides,
      },
    });

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
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.eventChangeRequest.deleteMany();
    await prisma.clarificationMessage.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();

    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER, 'Olive', 'Acme Corp');
    await seedUser('lead', 'lead@example.com', Role.EVENT_COORDINATOR_LEAD, 'Lena');
    await seedUser('marcus', 'marcus@example.com', Role.EVENT_COORDINATOR, 'Marcus');
    await seedUser('fatima', 'fatima@example.com', Role.EVENT_COORDINATOR, 'Fatima');
    await seedUser('venueStaff', 'venue@example.com', Role.VENUE_STAFF);
  });

  describe('a newly submitted request goes into the unassigned queue', () => {
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

    it('does not list drafts or already-assigned requests', async () => {
      await seedEvent({ status: EventStatus.DRAFT, submittedAt: null });
      await seedEvent({ coordinatorId: ids.marcus, status: EventStatus.PLANNING });

      const res = await queue().expect(200);

      expect(res.body).toEqual([]);
    });
  });

  describe('only the Lead can view the queue', () => {
    it('refuses every other role, Coordinators included', async () => {
      const event = await seedEvent();

      for (const who of ['marcus', 'fatima', 'organiser', 'venueStaff']) {
        await queue(who).expect(403);
        await queued(event.id, who).expect(403);
        await assign(event.id, ids.marcus, who).expect(403);
      }
    });

    it('requires authentication', async () => {
      await http().get('/assignments/queue').expect(401);
    });
  });

  describe('each queue entry shows the review details, oldest first', () => {
    it('lists event, Organiser, organisation, category, date, attendance and submission time', async () => {
      const event = await seedEvent();

      const res = await queue().expect(200);

      expect(res.body).toEqual([
        {
          id: event.id,
          name: 'Freshman Orientation 2030',
          organiser: { id: ids.organiser, name: 'Olive', email: 'organiser@example.com' },
          organisation: 'Acme Corp',
          category: 'Student engagement',
          proposedStart: '2030-10-01T09:00:00.000Z',
          proposedEnd: '2030-10-01T17:00:00.000Z',
          expectedAttendance: 99,
          submittedAt: '2030-01-01T00:00:00.000Z',
        },
      ]);
    });

    it('lists the oldest submission first', async () => {
      const newest = await seedEvent({
        name: 'Newest',
        submittedAt: new Date('2030-03-01T00:00:00Z'),
      });
      const oldest = await seedEvent({
        name: 'Oldest',
        submittedAt: new Date('2030-01-01T00:00:00Z'),
      });
      const middle = await seedEvent({
        name: 'Middle',
        submittedAt: new Date('2030-02-01T00:00:00Z'),
      });

      const res = await queue().expect(200);

      expect(res.body.map((e: { id: string }) => e.id)).toEqual([
        oldest.id,
        middle.id,
        newest.id,
      ]);
    });
  });

  describe('a queued request can be opened before assigning', () => {
    it('shows its basic event information', async () => {
      const event = await seedEvent({ preferredLayout: 'THEATRE', layoutNotes: 'Stage left' });

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

    it('does not open a request that has left the queue', async () => {
      const event = await seedEvent({ coordinatorId: ids.marcus });

      await queued(event.id).expect(404);
    });
  });

  describe('the Lead picks from the active Event Coordinators', () => {
    it('lists Coordinators only', async () => {
      const res = await http()
        .get('/assignments/coordinators')
        .set('Authorization', as('lead'))
        .expect(200);

      expect(res.body.map((c: { name: string }) => c.name)).toEqual(['Fatima', 'Marcus']);
    });

    it('refuses a target who is not a Coordinator', async () => {
      const event = await seedEvent();

      await assign(event.id, ids.venueStaff).expect(400);
      await assign(event.id, ids.lead).expect(400);
      await assign(event.id, 'no-such-user').expect(404);
    });
  });

  describe('assigning', () => {
    it('removes the request from the queue and puts it in that Coordinator’s list', async () => {
      const event = await seedEvent();

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

    it('records who assigned it, to whom and when in the change history', async () => {
      const event = await seedEvent();
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

    it('notifies the assigned Coordinator', async () => {
      const event = await seedEvent();
      await assign(event.id, ids.marcus).expect(200);

      const notes = await prisma.notification.findMany({
        where: { relatedEventId: event.id },
      });

      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({
        recipientId: ids.marcus,
        type: NotificationType.EVENT_ASSIGNED,
      });
    });

    it('blocks an already-assigned request and shows the current assignee', async () => {
      const event = await seedEvent();
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

    it('lets only one of two simultaneous assignments win', async () => {
      const event = await seedEvent();

      const results = await Promise.all([
        assign(event.id, ids.marcus),
        assign(event.id, ids.fatima),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const history = await prisma.eventChange.count({ where: { eventId: event.id } });
      expect(history).toBe(1);
    });

    it('does not assign a draft', async () => {
      const draft = await seedEvent({ status: EventStatus.DRAFT, submittedAt: null });

      await assign(draft.id, ids.marcus).expect(404);
    });
  });

  describe('a request still in the queue cannot be reviewed or edited by any Coordinator', () => {
    it('is invisible and untouchable to Coordinators', async () => {
      const event = await seedEvent();

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
    it('removes the Coordinator-side routes', async () => {
      const event = await seedEvent({ coordinatorId: ids.marcus, status: EventStatus.PLANNING });

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
    it('lists every Coordinator with their active events and a count', async () => {
      const a = await seedEvent({
        name: 'Later',
        coordinatorId: ids.marcus,
        status: EventStatus.PLANNING,
        proposedStart: new Date('2030-12-01T09:00:00Z'),
      });
      const b = await seedEvent({
        name: 'Sooner',
        coordinatorId: ids.marcus,
        status: EventStatus.CONFIRMED,
        proposedStart: new Date('2030-11-01T09:00:00Z'),
      });
      for (const status of [EventStatus.COMPLETED, EventStatus.CANCELLED, EventStatus.REJECTED]) {
        await seedEvent({ name: `Closed ${status}`, coordinatorId: ids.marcus, status });
      }
      // Unassigned requests belong to the queue, not to any Coordinator.
      await seedEvent({ name: 'Queued' });

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

    it('filters by Coordinator', async () => {
      await seedEvent({ coordinatorId: ids.marcus, status: EventStatus.PLANNING });
      await seedEvent({ coordinatorId: ids.fatima, status: EventStatus.PLANNING });

      const res = await overview(`?coordinatorId=${ids.fatima}`).expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].coordinator.id).toBe(ids.fatima);
      expect(res.body[0].activeCount).toBe(1);

      await overview(`?coordinatorId=${ids.venueStaff}`).expect(400);
    });

    it('is Lead-only; a Coordinator sees only their own events', async () => {
      await seedEvent({ coordinatorId: ids.marcus, status: EventStatus.PLANNING });
      await seedEvent({ coordinatorId: ids.fatima, status: EventStatus.PLANNING });

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
    it('moves the event: the previous Coordinator loses it and the new one gains it', async () => {
      const event = await seedEvent({
        coordinatorId: ids.marcus,
        status: EventStatus.PLANNING,
      });

      const res = await reassign(event.id, ids.fatima).expect(200);
      expect(res.body.coordinator.id).toBe(ids.fatima);

      await http().get(`/events/assigned/${event.id}`).set('Authorization', as('marcus')).expect(404);
      await http().post(`/events/${event.id}/approve`).set('Authorization', as('marcus')).expect(404);
      await http().get(`/events/assigned/${event.id}`).set('Authorization', as('fatima')).expect(200);
    });

    it('blocks reassigning to the current Coordinator', async () => {
      const event = await seedEvent({ coordinatorId: ids.marcus, status: EventStatus.PLANNING });

      await reassign(event.id, ids.marcus).expect(400);
    });

    it.each([EventStatus.COMPLETED, EventStatus.CANCELLED, EventStatus.REJECTED])(
      'blocks a %s event',
      async (status) => {
        const event = await seedEvent({ coordinatorId: ids.marcus, status });

        await reassign(event.id, ids.fatima).expect(409);

        const stored = await prisma.eventRequest.findUniqueOrThrow({ where: { id: event.id } });
        expect(stored.coordinatorId).toBe(ids.marcus);
      },
    );

    it('refers an unassigned request back to the queue', async () => {
      const event = await seedEvent();

      await reassign(event.id, ids.fatima).expect(409);
    });

    it('leaves bookings, reservations and comments untouched, and moves pending change requests', async () => {
      const venue = await prisma.venue.create({
        data: { name: 'Hall', location: 'Block A', capacity: 500 },
      });
      const event = await seedEvent({ coordinatorId: ids.marcus, status: EventStatus.PLANNING });
      const booking = await prisma.venueBooking.create({
        data: {
          eventId: event.id,
          venueId: venue.id,
          start: new Date('2030-10-01T09:00:00Z'),
          end: new Date('2030-10-01T17:00:00Z'),
          requestedById: ids.marcus,
        },
      });
      const message = await prisma.clarificationMessage.create({
        data: { eventId: event.id, authorId: ids.organiser, body: 'A question' },
      });
      await prisma.eventChangeRequest.create({
        data: {
          eventId: event.id,
          requestedById: ids.organiser,
          reason: 'More people are coming',
          proposedAttendance: 150,
          status: ChangeRequestStatus.PENDING,
        },
      });

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

    it('records who, from and to in the change history, and keeps earlier entries', async () => {
      const event = await seedEvent();
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

    it('notifies both the previous and the new Coordinator', async () => {
      const event = await seedEvent({ coordinatorId: ids.marcus, status: EventStatus.PLANNING });
      await reassign(event.id, ids.fatima).expect(200);

      const notes = await prisma.notification.findMany({
        where: { relatedEventId: event.id },
      });

      expect(notes.map((n) => [n.recipientId, n.type]).sort()).toEqual(
        [
          [ids.marcus, NotificationType.EVENT_REASSIGNED],
          [ids.fatima, NotificationType.EVENT_REASSIGNED],
        ].sort(),
      );
    });

    it('is Lead-only', async () => {
      const event = await seedEvent({ coordinatorId: ids.marcus, status: EventStatus.PLANNING });

      for (const who of ['marcus', 'fatima', 'organiser', 'venueStaff']) {
        await reassign(event.id, ids.fatima, who).expect(403);
      }
    });
  });
});
