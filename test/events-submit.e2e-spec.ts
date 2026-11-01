import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-03 (Submit a new event request), integration tests: the real Nest app
 * over HTTP (Supertest) and the local test database, one describe per
 * acceptance criterion. Code under test: POST /events (@Roles EVENT_ORGANISER)
 * -> CreateEventRequestDto validation -> EventsService.createAndSubmit(); the
 * Lead's queue (GET /assignments/queue) for AC-2.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql; a test that needs more loads the tc-s1
 * script its test case names (see docs/testing/sprint1-test-cases.md).
 */
describe('US-03 submit new event request (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';

  /** Fixed rows from base-users.sql. */
  const USERS = {
    organiser: { id: 'USR-006', email: 'organiser@example.com' },
    coordinator: { id: 'USR-004', email: 'coord.a@example.com' },
    attendee: { id: 'USR-001', email: 'attendee@example.com' },
  } as const;

  /** Fixed rows from tc-s1-22-setup.sql and tc-s1-25-setup.sql: loaded only by the tests that need them. */
  const EXTRA_USERS = {
    otherOrganiser: { id: 'USR-007', email: 'other@example.com' },
    lead: { id: 'USR-012', email: 'lead@example.com' },
  } as const;
  const ids = Object.fromEntries(
    Object.entries({ ...USERS, ...EXTRA_USERS }).map(([key, user]) => [key, user.id]),
  ) as Record<string, string>;
  const tokens: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  /** Loads a test case's setup script(s) on top of base-users. */
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Same global setup as main.ts (pipes, UnauthorizedFilter, CORS).
    configureApp(app);
    // Bound to 127.0.0.1 explicitly: with init() alone, or a dual-stack [::]
    // listener, the OS can hand out a port another local process already holds
    // on 127.0.0.1, and Supertest then talks to that process (hangs, or
    // "Parse Error: Expected HTTP/").
    await app.listen(0, '127.0.0.1');

    prisma = new PrismaClient();

    // Log each user in once, through the real endpoint. JWTs are stateless and
    // the users are re-created with the same IDs after every reset, so these
    // tokens stay valid for every test in the file.
    await resetDb(prisma);
    await loadSql(prisma, 'base-users');
    await loadSql(prisma, 'tc-s1-22-setup');
    await loadSql(prisma, 'tc-s1-25-setup');
    for (const [key, { email }] of Object.entries({ ...USERS, ...EXTRA_USERS })) {
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

  describe('AC-1: a complete, valid request is recorded as SUBMITTED', () => {
    // TC-S1-23 · US-03 AC-1 · setup: base-users · fails if a valid submission was not stored as SUBMITTED against its Organiser
    // Code: POST /events (@Roles EVENT_ORGANISER) validates CreateEventRequestDto, then
    // EventsService.createAndSubmit() saves it as SUBMITTED.
    it('returns 201 with status SUBMITTED', async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(validPayload())
        .expect(201);

      expect(res.body.status).toBe(EventStatus.SUBMITTED);
      expect(res.body.id).toEqual(expect.any(String));
    });

    // TC-S1-23 · US-03 AC-1 · setup: base-users · fails if a valid submission was not stored as SUBMITTED against its Organiser
    // Code: createAndSubmit() sets organiserId from the token, never from the body.
    it('persists the record against the calling organiser', async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(validPayload())
        .expect(201);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(stored.status).toBe(EventStatus.SUBMITTED);
      expect(stored.organiserId).toBe(ids.organiser);
    });

    // TC-S1-30 · US-03 AC-1, US-02 AC-5 · setup: base-users + tc-s1-22-setup · fails if a client could set owner/status, or another Organiser could see the request
    // Code: ValidationPipe whitelist strips organiserId and status; createAndSubmit() sets both
    // itself.
    it('ignores a client-supplied organiserId or status', async () => {
      await given('tc-s1-22-setup');
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send({
          ...validPayload(),
          organiserId: ids.otherOrganiser,
          status: EventStatus.APPROVED,
        })
        .expect(201);

      expect(res.body.organiserId).toBe(ids.organiser);
      expect(res.body.status).toBe(EventStatus.SUBMITTED);
    });

    // TC-S1-78 · US-03 AC-1, US-02 AC-3 · setup: base-users · fails if a Coordinator or Attendee could submit an event request, or one was saved
    // Code: @Roles(EVENT_ORGANISER) on POST /events; RolesGuard answers 403 before the service
    // runs.
    it('refuses a non-Organiser (@Roles enforcement)', async () => {
      for (const who of ['coordinator', 'attendee']) {
        await http()
          .post('/events')
          .set('Authorization', as(who))
          .send(validPayload())
          .expect(403);
      }
      expect(await prisma.eventRequest.count()).toBe(0);
    });

    // TC-S1-78 · US-03 AC-1, US-02 AC-8 · setup: base-users · fails if a request could be submitted without signing in
    // Code: JwtAuthGuard answers 401 before validation or the service.
    it('refuses an unauthenticated submission', async () => {
      await http().post('/events').send(validPayload()).expect(401);
      expect(await prisma.eventRequest.count()).toBe(0);
    });
  });

  describe('AC-2: confirmation, and visibility to Coordinators', () => {
    // TC-S1-24 · US-03 AC-2 · setup: base-users · fails if the response stopped confirming the created request
    // Code: createAndSubmit() returns the saved row (id, details, SUBMITTED, createdAt); the form
    // shows a confirmation from it.
    it('returns the persisted request as confirmation', async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(validPayload())
        .expect(201);

      expect(res.body).toMatchObject({
        name: 'Freshman Orientation 2030',
        category: 'Student engagement',
        expectedAttendance: 300,
        status: EventStatus.SUBMITTED,
      });
      expect(res.body.createdAt).toEqual(expect.any(String));
    });

    // TC-S1-25 · US-03 AC-2 · setup: base-users + tc-s1-25-setup · fails if a new submission did not reach the Lead's unassigned queue
    // Code: create() saves it SUBMITTED with coordinatorId NULL; EventsAssignmentService.listQueue() lists exactly those.
    it('puts the new request in the Event Coordinator Lead’s unassigned queue for review', async () => {
      await given('tc-s1-25-setup');
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(validPayload())
        .expect(201);

      const queue = await http().get('/assignments/queue').set('Authorization', as('lead')).expect(200);

      expect(queue.body).toEqual([
        expect.objectContaining({ id: res.body.id, name: 'Freshman Orientation 2030' }),
      ]);
    });

    // TC-S1-25 · US-03 AC-2 · setup: base-users · fails if a Coordinator could see a submission nobody has assigned to them
    // Code: coordinatorId starts NULL; a Coordinator's ASSIGNED scope matches only coordinatorId =
    // caller.
    it('keeps the request out of every Coordinator’s view until the Lead assigns it', async () => {
      // Week 7 Change 5: Coordinators no longer see unassigned submissions.
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(validPayload())
        .expect(201);

      expect(res.body.coordinatorId).toBeNull();
      const queue = await http()
        .get('/events')
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(queue.body).toHaveLength(0);
    });

    // TC-S1-30 · US-03 AC-2, US-02 AC-5 · setup: base-users + tc-s1-22-setup · fails if a client could set owner/status, or another Organiser could see the request
    // Code: GET /events for an Organiser is OWN scope (organiserId = caller).
    it('does not expose it to a different Organiser', async () => {
      await given('tc-s1-22-setup');
      await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(validPayload())
        .expect(201);

      const others = await http()
        .get('/events')
        .set('Authorization', as('otherOrganiser'))
        .expect(200);

      expect(others.body).toHaveLength(0);
    });
  });

  describe('AC-3: invalid input is blocked and each field flagged', () => {
    const messagesFor = async (payload: Record<string, unknown>) => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(payload)
        .expect(400);
      return (res.body.message as string[]).join(' | ');
    };

    // TC-S1-27 · US-03 AC-3 · setup: base-users · fails if a boundary value is accepted, or not flagged on its own field
    // Code: CreateEventRequestDto: @MinDate(now) on proposedStart, @IsAfterField('proposedStart')
    // on proposedEnd, @IsPositive on attendance, @Trim + @IsNotEmpty on name.
    it('blocks boundary values and flags each field: start just past, end = start, attendance 0, blank name', async () => {
      // One minute before the server's clock: "just in the past" without
      // depending on request latency.
      const justPast = new Date(Date.now() - 60_000).toISOString();

      const messages = await messagesFor(
        validPayload({
          name: '   ',
          proposedStart: justPast,
          proposedEnd: justPast,
          expectedAttendance: 0,
        }),
      );

      expect(messages).toMatch(/name is required/);
      expect(messages).toMatch(/proposedStart must be in the future/);
      expect(messages).toMatch(/proposedEnd must be later than proposedStart/);
      expect(messages).toMatch(/expectedAttendance must be greater than zero/);
      expect(await prisma.eventRequest.count()).toBe(0);
    });

    // TC-S1-26 · US-03 AC-3 · setup: base-users · fails if an invalid field was accepted, or not flagged with its message
    // Code: @MinDate(() => new Date()) answers 400 "proposedStart must be in the future".
    it('rejects a date in the past', async () => {
      const messages = await messagesFor(
        validPayload({
          proposedStart: '2020-01-01T09:00:00.000Z',
          proposedEnd: '2020-01-01T17:00:00.000Z',
        }),
      );
      expect(messages).toMatch(/proposedStart must be in the future/);
    });

    // TC-S1-26 · US-03 AC-3 · setup: base-users · fails if an invalid field was accepted, or not flagged with its message
    // Code: @Type(() => Number) + @IsInt answer 400 "expectedAttendance must be a whole number".
    it('rejects non-numeric attendance', async () => {
      const messages = await messagesFor(
        validPayload({ expectedAttendance: 'three hundred' }),
      );
      expect(messages).toMatch(/expectedAttendance must be a whole number/);
    });

    // TC-S1-26 · US-03 AC-3 · setup: base-users · fails if an invalid field was accepted, or not flagged with its message
    // Code: @IsAfterField('proposedStart') answers 400 "proposedEnd must be later than
    // proposedStart".
    it('rejects an end time before the start time, flagging proposedEnd', async () => {
      const messages = await messagesFor(
        validPayload({
          proposedStart: '2030-10-01T17:00:00.000Z',
          proposedEnd: '2030-10-01T09:00:00.000Z',
        }),
      );
      expect(messages).toMatch(/proposedEnd must be later than proposedStart/);
    });

    // TC-S1-29 · US-03 AC-5 · setup: base-users · fails if attendance was stored as a non-integer or a non-positive value was accepted
    // Code: @IsPositive answers 400 "expectedAttendance must be greater than zero".
    it('rejects zero and negative attendance (AC-5)', async () => {
      for (const value of [0, -5]) {
        const messages = await messagesFor(
          validPayload({ expectedAttendance: value }),
        );
        expect(messages).toMatch(/expectedAttendance must be greater than zero/);
      }
    });

    // TC-S1-29 · US-03 AC-5 · setup: base-users · fails if attendance was stored as a non-integer or a non-positive value was accepted
    // Code: @IsInt refuses 12.5 (400).
    it('rejects a fractional attendance', async () => {
      const messages = await messagesFor(
        validPayload({ expectedAttendance: 12.5 }),
      );
      expect(messages).toMatch(/expectedAttendance must be a whole number/);
    });

    // TC-S1-26 · US-03 AC-3 · setup: base-users · fails if an invalid field was accepted, or not flagged with its message
    // Code: category is @IsNotEmpty({ message: 'category is required' }).
    it('rejects a missing category', async () => {
      const payload = validPayload();
      delete (payload as Record<string, unknown>).category;
      expect(await messagesFor(payload)).toMatch(/category is required/);
    });

    // TC-S1-26 · US-03 AC-3 · setup: base-users · fails if an invalid field was accepted, or not flagged with its message
    // Code: ValidationPipe collects every DTO error into one 400 message array, one entry per
    // field.
    it('flags EVERY offending field at once, not just the first', async () => {
      const messages = await messagesFor(
        validPayload({
          purpose: '',
          category: '',
          expectedAttendance: 'not a number',
          proposedStart: '2020-01-01T09:00:00.000Z',
          proposedEnd: '2019-01-01T09:00:00.000Z',
        }),
      );

      expect(messages).toMatch(/purpose is required/);
      expect(messages).toMatch(/category is required/);
      expect(messages).toMatch(/expectedAttendance/);
      expect(messages).toMatch(/proposedStart must be in the future/);
      expect(messages).toMatch(/proposedEnd must be later than proposedStart/);
    });

    // TC-S1-26 · US-03 AC-3 · setup: base-users · fails if an invalid field was accepted, or not flagged with its message
    // Code: validation runs before createAndSubmit(), so nothing is written.
    it('persists nothing when validation fails', async () => {
      await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(validPayload({ expectedAttendance: -1 }))
        .expect(400);

      expect(await prisma.eventRequest.count()).toBe(0);
    });
  });

  describe('AC-4: the Organiser sees every detail plus current status', () => {
    // TC-S1-28 · US-03 AC-4 · setup: base-users · fails if a submitted detail was altered or the status was missing
    // Code: GET /events/:id (findOneForUser, OWN scope) returns the stored row with its status.
    it('returns each submitted field accurately', async () => {
      const payload = validPayload({
        preferredLayout: 'THEATRE',
        layoutNotes: 'Front row reserved for accessibility seating',
        accessibilityRequirements: ['HEARING_LOOP'],
        accessibilityNotes: 'Hearing loop required',
        equipmentNeeds: 'Six wireless microphones',
        registrationEnabled: true,
      });

      const created = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(payload)
        .expect(201);

      const viewed = await http()
        .get(`/events/${created.body.id}`)
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(viewed.body).toMatchObject({
        name: payload.name,
        purpose: payload.purpose,
        description: payload.description,
        category: payload.category,
        expectedAttendance: payload.expectedAttendance,
        preferredLayout: 'THEATRE',
        layoutNotes: 'Front row reserved for accessibility seating',
        accessibilityRequirements: ['HEARING_LOOP'],
        accessibilityNotes: 'Hearing loop required',
        equipmentNeeds: 'Six wireless microphones',
        registrationEnabled: true,
        status: EventStatus.SUBMITTED,
      });
      expect(new Date(viewed.body.proposedStart).toISOString()).toBe(payload.proposedStart);
      expect(new Date(viewed.body.proposedEnd).toISOString()).toBe(payload.proposedEnd);
    });

    // TC-S1-28 · US-03 AC-4 · setup: base-users · fails if a submitted detail was altered or the status was missing
    // Code: GET /events (findAllForUser, OWN scope) lists the Organiser's requests with status.
    it('lists it among the organiser’s own requests', async () => {
      await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(validPayload())
        .expect(201);

      const mine = await http()
        .get('/events')
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(mine.body).toHaveLength(1);
      expect(mine.body[0].status).toBe(EventStatus.SUBMITTED);
    });

    // TC-S1-30 · US-03 AC-4, US-02 AC-5 · setup: base-users + tc-s1-22-setup · fails if a client could set owner/status, or another Organiser could see the request
    // Code: the OWN-scoped lookup finds no row for another Organiser, so 404.
    it('denies another Organiser the record by id', async () => {
      await given('tc-s1-22-setup');
      const created = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(validPayload())
        .expect(201);

      await http()
        .get(`/events/${created.body.id}`)
        .set('Authorization', as('otherOrganiser'))
        .expect(404);
    });
  });

  describe('AC-5: attendance is stored as a positive whole number', () => {
    // TC-S1-29 · US-03 AC-5 · setup: base-users · fails if attendance was stored as a non-integer or a non-positive value was accepted
    // Code: expectedAttendance is an Int column, returned as a JSON number.
    it('round-trips the value as a number', async () => {
      const created = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(validPayload({ expectedAttendance: 420 }))
        .expect(201);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: created.body.id },
      });

      expect(stored.expectedAttendance).toBe(420);
      expect(Number.isInteger(stored.expectedAttendance)).toBe(true);
      expect(stored.expectedAttendance).toBeGreaterThan(0);
    });

    // TC-S1-29 · US-03 AC-5 · setup: base-users · fails if attendance was stored as a non-integer or a non-positive value was accepted
    // Code: @Type(() => Number) converts "300" before @IsInt runs.
    it('accepts a numeric string and stores it as a number', async () => {
      // transform: true coerces before validation, so a form posting "250"
      // is still stored as an integer for later venue-suitability checks.
      const created = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(validPayload({ expectedAttendance: '250' }))
        .expect(201);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      expect(stored.expectedAttendance).toBe(250);
    });
  });
});
