import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-06 e2e — layout and accessibility preferences.
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
    // TC-S1-47 · setup: base-users · fails if a predefined layout was refused or not saved
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

    // TC-S1-48 · setup: base-users · fails if a layout outside the list was accepted
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

    // TC-S1-48 · setup: base-users · fails if a layout outside the list was accepted
    it('rejects a free-text layout, which belongs in layoutNotes', async () => {
      await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send({ ...completeFields, preferredLayout: 'theatre style-ish' })
        .expect(400);
    });
  });

  describe('AC-2: optional free-text notes alongside the selection', () => {
    // TC-S1-49 · setup: base-users · fails if layout notes were dropped
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

    // TC-S1-49 · setup: base-users · fails if layout notes were dropped
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
    // TC-S1-50 · setup: base-users · fails if accessibility requirements or notes were not saved as entered
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

    // TC-S1-50 · setup: base-users · fails if accessibility requirements or notes were not saved as entered
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

    // TC-S1-50 · setup: base-users · fails if accessibility requirements or notes were not saved as entered
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

    // TC-S1-51 · setup: base-users · fails if an unknown or duplicate requirement was accepted
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

    // TC-S1-51 · setup: base-users · fails if an unknown or duplicate requirement was accepted
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

    // TC-S1-50 · setup: base-users · fails if accessibility requirements or notes were not saved as entered
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
    // TC-S1-52 · setup: base-users · fails if layout/accessibility values were lost on save, submit or edit
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

    // TC-S1-52 · setup: base-users · fails if layout/accessibility values were lost on save, submit or edit
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

    // TC-S1-52 · setup: base-users · fails if layout/accessibility values were lost on save, submit or edit
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
    // TC-S1-53 · setup: base-users · fails if empty layout/accessibility blocked saving or submitting
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

    // TC-S1-53 · setup: base-users · fails if empty layout/accessibility blocked saving or submitting
    it('saves an empty draft with neither recorded', async () => {
      const res = await http()
        .post('/events/drafts')
        .set('Authorization', as('organiser'))
        .send({})
        .expect(201);

      expect(res.body.accessibilityRequirements).toEqual([]);
    });

    // TC-S1-53 · setup: base-users · fails if empty layout/accessibility blocked saving or submitting
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
    const submitWithPreferences = async () => {
      const res = await http()
        .post('/events')
        .set('Authorization', as('organiser'))
        .send({
          ...completeFields,
          preferredLayout: 'THEATRE',
          layoutNotes: 'Centre aisle required',
          accessibilityRequirements: ['STEP_FREE_ACCESS', 'HEARING_LOOP'],
          accessibilityNotes: 'Ramp access to the stage',
        })
        .expect(201);
      // The Lead's assignment is a separate story; here the request is simply
      // already in this Coordinator's hands.
      await prisma.eventRequest.update({
        where: { id: res.body.id },
        data: { coordinatorId: ids.coordinator },
      });
      return res.body.id as string;
    };

    it('shows layout and accessibility in the review queue', async () => {
      await submitWithPreferences();

      const queue = await http()
        .get('/events')
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(queue.body[0]).toMatchObject({
        preferredLayout: 'THEATRE',
        layoutNotes: 'Centre aisle required',
        accessibilityRequirements: ['STEP_FREE_ACCESS', 'HEARING_LOOP'],
        accessibilityNotes: 'Ramp access to the stage',
      });
    });

    it('shows them when the Coordinator opens the request', async () => {
      const id = await submitWithPreferences();

      const opened = await http()
        .get(`/events/${id}`)
        .set('Authorization', as('coordinator'))
        .expect(200);

      expect(opened.body.preferredLayout).toBe('THEATRE');
      expect(opened.body.accessibilityRequirements).toEqual([
        'STEP_FREE_ACCESS',
        'HEARING_LOOP',
      ]);
    });

    it('still hides them from an Attendee — they are internal planning', async () => {
      await submitWithPreferences();

      const list = await http()
        .get('/events')
        .set('Authorization', as('attendee'))
        .expect(200);

      for (const event of list.body) {
        expect(event).not.toHaveProperty('preferredLayout');
        expect(event).not.toHaveProperty('layoutNotes');
        expect(event).not.toHaveProperty('accessibilityRequirements');
        expect(event).not.toHaveProperty('accessibilityNotes');
        // US-19 AC-3: internal planning too.
        expect(event).not.toHaveProperty('requiredFacilities');
      }
    });
  });
});
