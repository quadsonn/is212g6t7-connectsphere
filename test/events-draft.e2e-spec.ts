import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-04 (Save an incomplete request as a draft), integration tests: the real
 * Nest app over HTTP (Supertest) and the local test database, one describe per
 * acceptance criterion. Code under test: POST /events/drafts (saveDraft,
 * DraftEventRequestDto), PATCH /events/:id (updateDraft), POST /events/:id/submit
 * (submitDraft: re-validates against CreateEventRequestDto, then setStatus).
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql; a test that needs more loads the tc-s1
 * script its test case names (see docs/testing/sprint1-test-cases.md).
 */
describe('US-04 save event request as draft (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';

  /** Fixed rows from base-users.sql. */
  const USERS = {
    organiser: { id: 'USR-006', email: 'organiser@example.com' },
    coordinator: { id: 'USR-004', email: 'coord.a@example.com' },
  } as const;

  /** Fixed rows from tc-s1-22-setup.sql: loaded only by the tests that need them. */
  const EXTRA_USERS = {
    otherOrganiser: { id: 'USR-007', email: 'other@example.com' },
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

  const completeFields = {
    name: 'Freshman Orientation 2030',
    purpose: 'Welcome new students',
    description: 'Full-day programme',
    category: 'Student engagement',
    proposedStart: '2030-10-01T09:00:00.000Z',
    proposedEnd: '2030-10-01T17:00:00.000Z',
    expectedAttendance: 300,
  };

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

  describe('AC-1: saves without full submission validation, at DRAFT', () => {
    // TC-S1-31 · US-04 AC-1 · setup: base-users · fails if draft saving enforced submission rules, or accepted values of the wrong type
    // Code: POST /events/drafts uses DraftEventRequestDto, where every field is @IsOptional;
    // saveDraft() stores it as DRAFT.
    it('accepts a completely empty draft', async () => {
      const res = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({})
        .expect(201);

      expect(res.body.status).toBe(EventStatus.DRAFT);
      expect(res.body.id).toEqual(expect.any(String));
    });

    // TC-S1-31 · US-04 AC-1 · setup: base-users · fails if draft saving enforced submission rules, or accepted values of the wrong type
    // Code: DraftEventRequestDto has no @IsNotEmpty, so missing purpose, dates or attendance are
    // allowed.
    it('accepts a draft with required fields still empty', async () => {
      const res = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({ name: 'Work in progress' })
        .expect(201);

      expect(res.body.status).toBe(EventStatus.DRAFT);
      expect(res.body.name).toBe('Work in progress');
      expect(res.body.purpose).toBeNull();
      expect(res.body.expectedAttendance).toBeNull();
    });

    // TC-S1-31 · US-04 AC-1 · setup: base-users · fails if draft saving enforced submission rules, or accepted values of the wrong type
    // Code: DraftEventRequestDto has no @MinDate; the future-date rule only runs at submission.
    it('accepts a date in the past, which submission would reject', async () => {
      await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({
          proposedStart: '2020-01-01T09:00:00.000Z',
          proposedEnd: '2020-01-01T17:00:00.000Z',
        })
        .expect(201);
    });

    // TC-S1-31 · US-04 AC-1 · setup: base-users · fails if draft saving enforced submission rules, or accepted values of the wrong type
    // Code: DraftEventRequestDto still type-checks what is given (@IsInt, @IsDate, enums), so bad
    // types get 400.
    it('still rejects incoherent data', async () => {
      await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({ expectedAttendance: 'not a number' })
        .expect(400);

      await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({
          proposedStart: '2030-10-01T17:00:00.000Z',
          proposedEnd: '2030-10-01T09:00:00.000Z',
        })
        .expect(400);
    });

    // TC-S1-78 · US-04 AC-1, US-02 AC-3 · setup: base-users · fails if a non-Organiser could save a draft
    // Code: @Roles(EVENT_ORGANISER) on POST /events/drafts; RolesGuard answers 403.
    it('refuses a non-Organiser', async () => {
      await http()
        .post('/events/drafts')
        .set('Authorization', as('coordinator'))
        .send({})
        .expect(403);
    });

    // TC-S1-78 · US-04 AC-1, US-02 AC-8 · setup: base-users · fails if a draft could be saved without signing in
    // Code: JwtAuthGuard answers 401 before the controller.
    it('refuses an unauthenticated caller', async () => {
      await http().post('/events/drafts').send({}).expect(401);
    });
  });

  describe('AC-2: returning later to continue editing', () => {
    // TC-S1-32 · US-04 AC-2 · setup: base-users · fails if a reopened draft lost what was entered
    // Code: GET /events/:id (OWN scope) returns the stored draft field by field.
    it('opens the saved draft with what was entered', async () => {
      const created = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({ name: 'Half done', purpose: 'Partly written' })
        .expect(201);

      const reopened = await http()
        .get(`/events/${created.body.id}`)
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(reopened.body).toMatchObject({
        name: 'Half done',
        purpose: 'Partly written',
        status: EventStatus.DRAFT,
      });
    });

    // TC-S1-32 · US-04 AC-2 · setup: base-users · fails if a reopened draft lost what was entered
    // Code: PATCH /events/:id -> updateDraft() merges the new fields into the stored DRAFT,
    // keeping the rest.
    it('fills in the missing fields incrementally', async () => {
      const created = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({ name: 'Half done' })
        .expect(201);

      await http()
        .patch(`/events/${created.body.id}`)
        .set('Authorization', as('organiser'))
        .send({ purpose: 'Added on the second visit' })
        .expect(200);

      const after = await http()
        .get(`/events/${created.body.id}`)
        .set('Authorization', as('organiser'))
        .expect(200);

      // The earlier value survived the partial edit.
      expect(after.body.name).toBe('Half done');
      expect(after.body.purpose).toBe('Added on the second visit');
    });

    // TC-S1-38 · US-04 AC-2, US-02 AC-5 · setup: base-users + tc-s1-22-setup · fails if an Organiser could edit or submit someone else's draft
    // Code: updateDraft() loads the row through assertEventAccess(UPDATE), OWN scope, so another's
    // draft is 404.
    it('refuses to edit another Organiser’s draft', async () => {
      await given('tc-s1-22-setup');
      const created = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({ name: 'Mine' })
        .expect(201);

      await http()
        .patch(`/events/${created.body.id}`)
        .set('Authorization', as('otherOrganiser'))
        .send({ name: 'Hijacked' })
        .expect(404);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      expect(stored.name).toBe('Mine');
    });
  });

  describe('AC-3: drafts are distinguishable in the list', () => {
    // TC-S1-33 · US-04 AC-3 · setup: base-users · fails if drafts and submitted requests were labelled alike
    // Code: the list returns each request's own status; the screen's badge comes from it (UI part:
    // TC-S1-34).
    it('marks a draft DRAFT and a submitted request SUBMITTED', async () => {
      await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({ name: 'Still a draft' })
        .expect(201);

      await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(completeFields)
        .expect(201);

      const list = await http()
        .get('/events')
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(list.body).toHaveLength(2);

      const byName = Object.fromEntries(
        list.body.map((e: { name: string; status: string }) => [e.name, e.status]),
      );
      expect(byName['Still a draft']).toBe(EventStatus.DRAFT);
      expect(byName['Freshman Orientation 2030']).toBe(EventStatus.SUBMITTED);
    });

    // TC-S1-33 · US-04 AC-3 · setup: base-users · fails if a Coordinator could see an Organiser's unfinished draft
    // Code: a DRAFT has no Coordinator and is not in the Lead's queue, so no Coordinator's
    // ASSIGNED scope matches it.
    it('keeps drafts out of the Coordinator review queue', async () => {
      await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({ name: 'Still a draft' })
        .expect(201);

      const queue = await http()
        .get('/events')
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(queue.body).toHaveLength(0);
    });
  });

  describe('AC-4: a completed draft submits via the transition method', () => {
    // TC-S1-35 · US-04 AC-4 · setup: base-users · fails if submitting a complete draft did not move it to SUBMITTED
    // Code: POST /events/:id/submit -> submitDraft() re-validates against CreateEventRequestDto,
    // then setStatus(SUBMITTED).
    it('moves DRAFT -> SUBMITTED', async () => {
      const created = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send(completeFields)
        .expect(201);

      expect(created.body.status).toBe(EventStatus.DRAFT);

      const submitted = await http()
        .post(`/events/${created.body.id}/submit`)
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(submitted.body.status).toBe(EventStatus.SUBMITTED);
    });

    // TC-S1-35 · US-04 AC-4, US-03 AC-2 · setup: base-users · fails if a submitted draft skipped the Lead's queue and reached a Coordinator
    // Code: submitDraft() leaves coordinatorId NULL, so it waits in the Lead's unassigned queue
    // (Week 7 Change 5).
    it('keeps it out of every Coordinator’s view once submitted, until the Lead assigns it', async () => {
      const created = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send(completeFields)
        .expect(201);

      await http()
        .post(`/events/${created.body.id}/submit`)
        .set('Authorization', as('organiser'))
        .expect(200);

      const queue = await http()
        .get('/events')
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(queue.body).toHaveLength(0);
    });

    // TC-S1-36 · US-04 AC-4 · setup: base-users · fails if an incomplete or past-dated draft could be submitted
    // Code: assertReadyForSubmission() runs class-validator with CreateEventRequestDto and answers
    // 400 with every message.
    it('blocks submitting an incomplete draft and flags each missing field', async () => {
      const created = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({ name: 'Only a name' })
        .expect(201);

      const res = await http()
        .post(`/events/${created.body.id}/submit`)
        .set('Authorization', as('organiser'))
        .expect(400);

      const messages = (res.body.message as string[]).join(' | ');
      expect(messages).toMatch(/purpose/);
      expect(messages).toMatch(/category/);
      expect(messages).toMatch(/expectedAttendance/);

      const stored = await prisma.eventRequest.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      expect(stored.status).toBe(EventStatus.DRAFT);
    });

    // TC-S1-36 · US-04 AC-4 · setup: base-users · fails if an incomplete or past-dated draft could be submitted
    // Code: the same check applies @MinDate(now) at submission time, not at save time.
    it('blocks submitting a draft whose date has since passed', async () => {
      const created = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({
          ...completeFields,
          proposedStart: '2020-01-01T09:00:00.000Z',
          proposedEnd: '2020-01-01T17:00:00.000Z',
        })
        .expect(201);

      const res = await http()
        .post(`/events/${created.body.id}/submit`)
        .set('Authorization', as('organiser'))
        .expect(400);

      expect((res.body.message as string[]).join(' | ')).toMatch(
        /proposedStart must be in the future/,
      );
    });

    // TC-S1-38 · US-04 AC-4, US-02 AC-5 · setup: base-users + tc-s1-22-setup · fails if an Organiser could edit or submit someone else's draft
    // Code: submitDraft() loads through assertEventAccess(SUBMIT), OWN scope, so 404.
    it('refuses to submit another Organiser’s draft', async () => {
      await given('tc-s1-22-setup');
      const created = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send(completeFields)
        .expect(201);

      await http()
        .post(`/events/${created.body.id}/submit`)
        .set('Authorization', as('otherOrganiser'))
        .expect(404);
    });
  });

  describe('AC-5: a submitted request does not behave as a draft', () => {
    const submitOne = async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(completeFields)
        .expect(201);
      return res.body.id as string;
    };

    // TC-S1-37 · US-04 AC-5 · setup: base-users · fails if a submitted request could still be edited or re-submitted
    // Code: assertIsEditable() allows only DRAFT or RETURNED, so a SUBMITTED request gets 409.
    it('refuses to edit it', async () => {
      const id = await submitOne();

      const res = await http()
        .patch(`/events/${id}`)
        .set('Authorization', as('organiser'))
        .send({ name: 'Changed after submission' })
        .expect(409);

      expect(res.body.message).toMatch(/SUBMITTED/);
    });

    // TC-S1-37 · US-04 AC-5 · setup: base-users · fails if a submitted request could still be edited or re-submitted
    // Code: assertIsEditable() throws before any update is written.
    it('leaves the stored record untouched after a refused edit', async () => {
      const id = await submitOne();

      await http()
        .patch(`/events/${id}`)
        .set('Authorization', as('organiser'))
        .send({ name: 'Changed after submission' })
        .expect(409);

      const stored = await prisma.eventRequest.findUniqueOrThrow({ where: { id } });
      expect(stored.name).toBe(completeFields.name);
    });

    // TC-S1-37 · US-04 AC-5 · setup: base-users · fails if a submitted request could still be edited or re-submitted
    // Code: submitDraft() calls assertIsEditable() first, so a second submit is 409.
    it('refuses to submit it again', async () => {
      const id = await submitOne();

      await http()
        .post(`/events/${id}/submit`)
        .set('Authorization', as('organiser'))
        .expect(409);
    });

    // TC-S1-37 · US-04 AC-5 · setup: base-users · fails if a submitted request could still be edited or re-submitted
    // Code: GET /events/:id still returns it, read-only, with status SUBMITTED.
    it('still shows it, with its status', async () => {
      const id = await submitOne();

      const res = await http()
        .get(`/events/${id}`)
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(res.body.status).toBe(EventStatus.SUBMITTED);
    });
  });
});
