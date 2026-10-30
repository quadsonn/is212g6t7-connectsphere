import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-06 (Specify preferred room layout and accessibility requirements), integration tests: the real Nest app over HTTP
 * (Supertest) and the local test database, one describe per acceptance
 * criterion. Code under test: the layout and accessibility fields of
 * CreateEventRequestDto / DraftEventRequestDto (RoomLayout and
 * AccessibilityFeature enums), saved by createAndSubmit()/saveDraft()/updateDraft(),
 * and the assigned Coordinator's view.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql; a test that needs more loads the tc-s1
 * script its test case names (see docs/testing/sprint1-test-cases.md).
 */
describe('US-06 layout and accessibility preferences (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';

  /** Fixed rows from base-users.sql. */
  const USERS = {
    organiser: { id: 'USR-006', email: 'organiser@example.com' },
    coordinator: { id: 'USR-004', email: 'coord.a@example.com' },
    attendee: { id: 'USR-001', email: 'attendee@example.com' },
  } as const;

  const EXTRA_USERS = {} as const;
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

  describe('AC-1: layout comes from a predefined list', () => {
    // TC-S1-47 · US-06 AC-1 · setup: base-users · fails if a predefined layout was refused or not saved
    // Code: preferredLayout is @IsEnum(RoomLayout); each listed layout is stored as given.
    it.each(['THEATRE', 'CLASSROOM', 'BANQUET', 'BOARDROOM'])(
      'accepts %s',
      async (layout) => {
        const res = await http()
          .post('/events')
          .set('Authorization', as('organiser'))
          .send({ ...completeFields, preferredLayout: layout })
          .expect(201);

        expect(res.body.preferredLayout).toBe(layout);
      },
    );

    // TC-S1-48 · US-06 AC-1 · setup: base-users · fails if a layout outside the list was accepted
    // Code: @IsEnum(RoomLayout) answers 400 "preferredLayout must be one of: ...".
    it('rejects a layout outside the list and names the valid options', async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send({ ...completeFields, preferredLayout: 'CABARET' })
        .expect(400);

      const messages = (res.body.message as string[]).join(' | ');
      expect(messages).toMatch(/preferredLayout must be one of/);
      expect(messages).toMatch(/THEATRE.*CLASSROOM.*BANQUET.*BOARDROOM/);
    });

    // TC-S1-48 · US-06 AC-1 · setup: base-users · fails if a layout outside the list was accepted
    // Code: free text is not a RoomLayout value, so 400; the notes field is layoutNotes.
    it('rejects a free-text layout, which belongs in layoutNotes', async () => {
      await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send({ ...completeFields, preferredLayout: 'theatre style-ish' })
        .expect(400);
    });
  });

  describe('AC-2: optional free-text notes alongside the selection', () => {
    // TC-S1-49 · US-06 AC-2 · setup: base-users · fails if layout notes were dropped
    // Code: layoutNotes is an optional @Trim @MaxLength(2000) string saved alongside
    // preferredLayout.
    it('stores notes with a selection', async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send({
          ...completeFields,
          preferredLayout: 'THEATRE',
          layoutNotes: 'Raised platform at the front, centre aisle',
        })
        .expect(201);

      expect(res.body.preferredLayout).toBe('THEATRE');
      expect(res.body.layoutNotes).toMatch(/centre aisle/);
    });

    // TC-S1-49 · US-06 AC-2 · setup: base-users · fails if layout notes were dropped
    // Code: preferredLayout is @IsOptional, so notes alone are accepted.
    it('stores notes with no selection, for a layout not on the list', async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send({ ...completeFields, layoutNotes: 'Cabaret, eight to a table' })
        .expect(201);

      expect(res.body.preferredLayout).toBeNull();
      expect(res.body.layoutNotes).toMatch(/Cabaret/);
    });
  });

  describe('AC-3: accessibility requirements with optional notes', () => {
    // TC-S1-50 · US-06 AC-3 · setup: base-users · fails if accessibility requirements or notes were not saved as entered
    // Code: accessibilityRequirements is an array of AccessibilityFeature (@IsEnum each), stored
    // as a Postgres enum array.
    it('records multiple requirements', async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send({
          ...completeFields,
          accessibilityRequirements: ['STEP_FREE_ACCESS', 'HEARING_LOOP'],
        })
        .expect(201);

      expect(res.body.accessibilityRequirements).toEqual([
        'STEP_FREE_ACCESS',
        'HEARING_LOOP',
      ]);
    });

    // TC-S1-50 · US-06 AC-3 · setup: base-users · fails if accessibility requirements or notes were not saved as entered
    // Code: accessibilityNotes is saved next to the structured list.
    it('records requirements with notes', async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send({
          ...completeFields,
          accessibilityRequirements: ['ACCESSIBLE_RESTROOMS'],
          accessibilityNotes: 'Must be on the same floor as the venue',
        })
        .expect(201);

      expect(res.body.accessibilityRequirements).toEqual(['ACCESSIBLE_RESTROOMS']);
      expect(res.body.accessibilityNotes).toMatch(/same floor/);
    });

    // TC-S1-50 · US-06 AC-3 · setup: base-users · fails if accessibility requirements or notes were not saved as entered
    // Code: the AccessibilityFeature enum (shared with venues) includes the later additions.
    it('accepts the newer features added to the list', async () => {
      const added = [
        'WHEELCHAIR_ACCESSIBLE_LIFT',
        'ACCESSIBLE_PARKING',
        'WHEELCHAIR_SEATING',
        'NURSING_ROOM',
      ];
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send({ ...completeFields, accessibilityRequirements: added })
        .expect(201);

      expect(res.body.accessibilityRequirements).toEqual(added);
    });

    // TC-S1-51 · US-06 AC-3 · setup: base-users · fails if an unknown or duplicate requirement was accepted
    // Code: @IsEnum(AccessibilityFeature, { each: true }) answers 400 naming the allowed values.
    it('rejects an unrecognised requirement', async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send({
          ...completeFields,
          accessibilityRequirements: ['STEP_FREE_ACCESS', 'TELEPORTER'],
        })
        .expect(400);

      expect((res.body.message as string[]).join(' | ')).toMatch(
        /accessibilityRequirements must contain only/,
      );
    });

    // TC-S1-51 · US-06 AC-3 · setup: base-users · fails if an unknown or duplicate requirement was accepted
    // Code: @ArrayUnique() answers 400.
    it('rejects duplicates', async () => {
      await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send({
          ...completeFields,
          accessibilityRequirements: ['HEARING_LOOP', 'HEARING_LOOP'],
        })
        .expect(400);
    });

    // TC-S1-50 · US-06 AC-3 · setup: base-users · fails if accessibility requirements or notes were not saved as entered
    // Code: both fields are @IsOptional, so notes alone are kept.
    it('accepts notes with no structured requirement selected', async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send({
          ...completeFields,
          accessibilityNotes: 'Quiet room required for sensory needs',
        })
        .expect(201);

      expect(res.body.accessibilityRequirements).toEqual([]);
      expect(res.body.accessibilityNotes).toMatch(/Quiet room/);
    });
  });

  describe('AC-4: values persist on draft and submitted, and survive reopening', () => {
    // TC-S1-52 · US-06 AC-4 · setup: base-users · fails if layout/accessibility values were lost on save, submit or edit
    // Code: saveDraft() stores them; GET /events/:id returns them.
    it('persists on a draft and is there when reopened', async () => {
      const created = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({
          name: 'Work in progress',
          preferredLayout: 'BANQUET',
          layoutNotes: 'Round tables',
          accessibilityRequirements: ['STEP_FREE_ACCESS'],
          accessibilityNotes: 'Ramp to the stage',
        })
        .expect(201);

      const reopened = await http()
        .get(`/events/${created.body.id}`)
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(reopened.body).toMatchObject({
        status: EventStatus.DRAFT,
        preferredLayout: 'BANQUET',
        layoutNotes: 'Round tables',
        accessibilityRequirements: ['STEP_FREE_ACCESS'],
        accessibilityNotes: 'Ramp to the stage',
      });
    });

    // TC-S1-52 · US-06 AC-4 · setup: base-users · fails if layout/accessibility values were lost on save, submit or edit
    // Code: submitDraft() changes only the status (setStatus), leaving the preferences untouched.
    it('survives the draft being submitted', async () => {
      const created = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({
          ...completeFields,
          preferredLayout: 'CLASSROOM',
          accessibilityRequirements: ['HEARING_LOOP'],
          accessibilityNotes: 'Loop must reach the back row',
        })
        .expect(201);

      await http()
        .post(`/events/${created.body.id}/submit`)
        .set('Authorization', as('organiser'))
        .expect(200);

      const after = await http()
        .get(`/events/${created.body.id}`)
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(after.body).toMatchObject({
        status: EventStatus.SUBMITTED,
        preferredLayout: 'CLASSROOM',
        accessibilityRequirements: ['HEARING_LOOP'],
        accessibilityNotes: 'Loop must reach the back row',
      });
    });

    // TC-S1-52 · US-06 AC-4 · setup: base-users · fails if layout/accessibility values were lost on save, submit or edit
    // Code: updateDraft() replaces the given fields and keeps the rest.
    it('can be edited on a draft before submission', async () => {
      const created = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({ preferredLayout: 'THEATRE' })
        .expect(201);

      await http()
        .patch(`/events/${created.body.id}`)
        .set('Authorization', as('organiser'))
        .send({
          preferredLayout: 'BOARDROOM',
          accessibilityRequirements: ['ACCESSIBLE_RESTROOMS'],
        })
        .expect(200);

      const after = await http()
        .get(`/events/${created.body.id}`)
        .set('Authorization', as('organiser'))
        .expect(200);

      expect(after.body.preferredLayout).toBe('BOARDROOM');
      expect(after.body.accessibilityRequirements).toEqual(['ACCESSIBLE_RESTROOMS']);
    });
  });

  describe('AC-5: leaving them empty still saves', () => {
    // TC-S1-53 · US-06 AC-5 · setup: base-users · fails if empty layout/accessibility blocked saving or submitting
    // Code: CreateEventRequestDto marks all four preference fields @IsOptional.
    it('submits a request with neither recorded', async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send(completeFields)
        .expect(201);

      expect(res.body.preferredLayout).toBeNull();
      expect(res.body.layoutNotes).toBeNull();
      expect(res.body.accessibilityRequirements).toEqual([]);
      expect(res.body.accessibilityNotes).toBeNull();
      expect(res.body.status).toBe(EventStatus.SUBMITTED);
    });

    // TC-S1-53 · US-06 AC-5 · setup: base-users · fails if empty layout/accessibility blocked saving or submitting
    // Code: DraftEventRequestDto has no required fields.
    it('saves an empty draft with neither recorded', async () => {
      const res = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({})
        .expect(201);

      expect(res.body.accessibilityRequirements).toEqual([]);
    });

    // TC-S1-53 · US-06 AC-5 · setup: base-users · fails if empty layout/accessibility blocked saving or submitting
    // Code: assertReadyForSubmission() checks CreateEventRequestDto, where the preferences are
    // optional.
    it('submits a completed draft that omits them', async () => {
      const created = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send(completeFields)
        .expect(201);

      await http()
        .post(`/events/${created.body.id}/submit`)
        .set('Authorization', as('organiser'))
        .expect(200);
    });
  });

  describe('AC-6: a Coordinator reviewing the request sees both', () => {
    /** tc-s1-54-setup.sql: SUBMITTED, assigned to USR-004, with both recorded. */
    const REVIEWED = 'EVT-153';

    // TC-S1-54 · US-06 AC-6 · setup: base-users + tc-s1-54-setup · fails if the assigned Coordinator's list lost the layout or accessibility values
    // Code: GET /events (ASSIGNED scope) returns the full event row to its Coordinator, preferences included.
    it('shows layout and accessibility in the Coordinator’s list of assigned requests', async () => {
      await given('tc-s1-54-setup');

      const list = await http().get('/events').set('Authorization', as('coordinator')).expect(200);

      expect(list.body).toEqual([
        expect.objectContaining({
          id: REVIEWED,
          preferredLayout: 'THEATRE',
          layoutNotes: 'Centre aisle, front row reserved',
          accessibilityRequirements: ['STEP_FREE_ACCESS', 'HEARING_LOOP'],
          accessibilityNotes: 'Ramp access to the stage',
        }),
      ]);
    });

    // TC-S1-54 · US-06 AC-6 · setup: base-users + tc-s1-54-setup · fails if opening the request for review hid the preferences
    // Code: GET /events/:id for the assigned Coordinator returns the same full row (assertEventAccess, ASSIGNED).
    it('shows them when the Coordinator opens the request', async () => {
      await given('tc-s1-54-setup');

      const opened = await http().get(`/events/${REVIEWED}`).set('Authorization', as('coordinator')).expect(200);

      expect(opened.body).toMatchObject({
        preferredLayout: 'THEATRE',
        layoutNotes: 'Centre aisle, front row reserved',
        accessibilityRequirements: ['STEP_FREE_ACCESS', 'HEARING_LOOP'],
        accessibilityNotes: 'Ramp access to the stage',
      });
    });

    // TC-S1-54 · US-06 AC-6, with US-02 AC-7 · setup: base-users + tc-s1-54-setup · fails if an Attendee received the layout or accessibility planning
    // Code: an Attendee reads only CONFIRMED events open for registration, through the public projection
    // (projectEvent), so a request under review is invisible and planning fields never leave the server.
    it('still hides them from an Attendee — they are internal planning', async () => {
      await given('tc-s1-54-setup');

      const list = await http().get('/events').set('Authorization', as('attendee')).expect(200);
      const opened = await http().get(`/events/${REVIEWED}`).set('Authorization', as('attendee')).expect(404);

      expect(list.body.map((e: { id: string }) => e.id)).not.toContain(REVIEWED);
      expect(JSON.stringify(list.body) + JSON.stringify(opened.body)).not.toMatch(/Centre aisle|Ramp access|THEATRE/);
    });
  });
});
