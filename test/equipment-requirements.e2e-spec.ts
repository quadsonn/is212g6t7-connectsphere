import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-30 (Story 30) — Technical Support view the equipment and technical
 * requirements described for an event, before committing resources.
 * Integration tests, one describe per acceptance criterion.
 *
 * An event's requirements have three sources: the Organiser's free-text
 * equipment needs (at submission), and the Coordinator's requirement rows and
 * technical support notes (Story 27).
 *
 * The code under test (EquipmentRequirementsService, all routes
 * @Roles(TECHNICAL_SUPPORT_STAFF), Cache-Control: no-store):
 *  - GET /equipment/requirements: events in TECHNICAL_SUPPORT_VISIBLE_STATUSES
 *    (every status but DRAFT) with at least one non-blank source
 *    (REQUIREMENTS_VISIBLE_WHERE), each with the requirement content itself.
 *  - GET /equipment/requirements/:eventId: one event's three sources, plus
 *    hasRequirements and a "none recorded" message when all are empty or blank.
 *  - GET /equipment/requirements/:eventId/details: "View more details", the
 *    event's planning details, for any non-draft event.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql and tc-s2-114-setup.sql (one event per mix
 * of sources, one with none, and a draft); one test then loads tc-s2-117
 * (docs/testing/sprint2-test-cases.md).
 */
describe('Story 30 view equipment and technical requirements for an event (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';

  /** Fixed users from base-users.sql. */
  const USERS = {
    tech: 'tech.support@example.com',
    coordinator: 'coord.a@example.com',
    organiser: 'organiser@example.com',
    attendee: 'attendee@example.com',
    venueStaff: 'venue.staff@example.com',
  } as const;
  const tokens: Record<string, string> = {};
  const OTHER_ROLES = ['coordinator', 'organiser', 'attendee', 'venueStaff'] as const;

  /** Fixed events from tc-s2-114/117-setup.sql. */
  const EVENT = {
    organiserOnly: 'EVT-120',
    rowsOnly: 'EVT-121',
    notesOnly: 'EVT-119',
    allThree: 'EVT-115',
    none: 'EVT-118',
    draft: 'EVT-117',
    blank: 'EVT-116',
  } as const;

  const START = '2030-10-01T09:00:00.000Z';
  const END = '2030-10-01T17:00:00.000Z';
  const NONE = 'No equipment or technical requirements have been recorded for this event.';

  const as = (who: keyof typeof USERS) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const get = (path: string, who: keyof typeof USERS = 'tech') => http().get(path).set('Authorization', as(who));
  const requirements = (eventId: string) => get(`/equipment/requirements/${eventId}`);
  const details = (eventId: string) => get(`/equipment/requirements/${eventId}/details`);

  const listedIds = async (): Promise<string[]> =>
    (await get('/equipment/requirements').expect(200)).body.map((e: { eventId: string }) => e.eventId);

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
    await given('base-users', 'tc-s2-114-setup');
  });

  describe('AC-1: requirements are visible, whether from the Organiser or the Coordinator', () => {
    // TC-S2-114 · US-30 AC-1 · setup: base-users + tc-s2-114-setup · fails if the Organiser's submitted equipment needs weren't shown
    // Code: the requirements view returns equipmentNeeds as organiserEquipmentNeeds, alongside the two Coordinator sources.
    it("shows the Organiser's equipment needs on their own", async () => {
      const res = await requirements(EVENT.organiserOnly).expect(200);

      expect(res.body).toEqual({
        eventId: EVENT.organiserOnly,
        name: 'Organiser Only',
        description: 'Organiser Only - description',
        status: 'PLANNING',
        proposedStart: START,
        proposedEnd: END,
        organiserEquipmentNeeds: 'Six wireless mics.',
        coordinatorRequirements: [],
        technicalSupportNeeds: null,
        hasRequirements: true,
        message: null,
      });
      expect(res.headers['cache-control']).toBe('no-store');
    });

    // TC-S2-114 · US-30 AC-1 · setup: base-users + tc-s2-114-setup · fails if the Coordinator's requirement rows weren't shown
    // Code: coordinatorRequirements lists the EquipmentRequirement rows (type, quantity, notes) in the order entered (createdAt, then id).
    it("shows the Coordinator's requirement rows on their own", async () => {
      const res = await requirements(EVENT.rowsOnly).expect(200);

      expect(res.body).toMatchObject({ organiserEquipmentNeeds: null, technicalSupportNeeds: null, hasRequirements: true });
      expect(res.body.coordinatorRequirements).toEqual([
        { id: 'REQ-008', equipmentType: 'Laser projector', quantity: 2, notes: null },
        { id: 'REQ-007', equipmentType: 'Wireless microphone', quantity: 6, notes: 'Lapel' },
      ]);
    });

    // TC-S2-114 · US-30 AC-1 · setup: base-users + tc-s2-114-setup · fails if technical support notes weren't shown
    // Code: technicalSupportNeeds is returned as recorded by the Coordinator.
    it('shows the technical support notes on their own', async () => {
      const res = await requirements(EVENT.notesOnly).expect(200);

      expect(res.body).toMatchObject({
        organiserEquipmentNeeds: null,
        coordinatorRequirements: [],
        technicalSupportNeeds: 'On-site AV technician all day.',
        hasRequirements: true,
      });
    });

    // TC-S2-114 · US-30 AC-1 · setup: base-users + tc-s2-114-setup · fails if one source hid another when all three were recorded
    // Code: the three sources are read independently and returned together.
    it('shows all three sources together', async () => {
      const res = await requirements(EVENT.allThree).expect(200);

      expect(res.body).toMatchObject({
        organiserEquipmentNeeds: 'Mics and a projector.',
        technicalSupportNeeds: 'Technician on call.',
        coordinatorRequirements: [{ equipmentType: 'PA system', quantity: 1, notes: null }],
        hasRequirements: true,
      });
    });
  });

  describe('AC-4: the list holds only submitted events with at least one requirement', () => {
    // TC-S2-115 · US-30 AC-1, AC-4 · setup: base-users + tc-s2-114-setup · fails if an event with any one source were missing from the list, or one with none or a draft were in it
    // Code: REQUIREMENTS_VISIBLE_WHERE: a non-draft status and at least one non-blank source.
    it('lists exactly the non-draft events with at least one source', async () => {
      expect((await listedIds()).sort()).toEqual([EVENT.allThree, EVENT.notesOnly, EVENT.organiserOnly, EVENT.rowsOnly].sort());
    });

    // TC-S2-115 · US-30 AC-4 · setup: base-users + tc-s2-114-setup · fails if a draft could be opened through the requirements routes
    // Code: both routes look the event up within TECHNICAL_SUPPORT_VISIBLE_STATUSES, so a draft reads as not found.
    it('hides a draft from the requirements and details routes (404)', async () => {
      await requirements(EVENT.draft).expect(404);
      await details(EVENT.draft).expect(404);
    });
  });

  describe('AC-2: what was requested is shown, not just that a request exists', () => {
    // TC-S2-116 · US-30 AC-2 · setup: base-users + tc-s2-114-setup · fails if the list only flagged that an event has requirements without saying what they are
    // Code: each list entry carries the same three sources as the single-event view.
    it('carries the requirement content in the list itself', async () => {
      const res = await get('/equipment/requirements').expect(200);
      const rows = res.body.find((e: { eventId: string }) => e.eventId === EVENT.rowsOnly);

      expect(rows.coordinatorRequirements).toEqual([
        expect.objectContaining({ equipmentType: 'Laser projector', quantity: 2 }),
        expect.objectContaining({ equipmentType: 'Wireless microphone', quantity: 6, notes: 'Lapel' }),
      ]);
    });

    // TC-S2-116 · US-30 AC-2 · setup: base-users + tc-s2-114-setup · fails if the requirements view leaked unrelated planning fields
    // Code: the requirements select names only the event summary and the three sources.
    it('shows the requirements, not other planning fields', async () => {
      const res = await requirements(EVENT.allThree).expect(200);

      for (const field of ['expectedAttendance', 'preferredLayout', 'accessibilityRequirements', 'programme']) {
        expect(res.body).not.toHaveProperty(field);
      }
    });
  });

  describe('AC-3: no requirements recorded is clearly indicated', () => {
    // TC-S2-117 · US-30 AC-3 · setup: base-users + tc-s2-114-setup · fails if an event with nothing recorded showed an empty view without saying so
    // Code: hasRequirements is false and the view carries NONE as its message.
    it('says so for a submitted event with nothing recorded', async () => {
      const res = await requirements(EVENT.none).expect(200);

      expect(res.body).toMatchObject({
        organiserEquipmentNeeds: null,
        coordinatorRequirements: [],
        technicalSupportNeeds: null,
        hasRequirements: false,
        message: NONE,
      });
    });

    // TC-S2-117 · US-30 AC-3 · setup: base-users + tc-s2-114-setup + tc-s2-117-setup · fails if text made only of spaces counted as a requirement
    // Code: blank text is treated as empty, both for hasRequirements and for the list filter.
    it('treats text made only of spaces as nothing recorded', async () => {
      await given('tc-s2-117-setup');

      const res = await requirements(EVENT.blank).expect(200);

      expect(res.body).toMatchObject({ hasRequirements: false, message: NONE });
      expect(await listedIds()).not.toContain(EVENT.blank);
    });
  });

  describe('access: Technical Support only', () => {
    // TC-S2-118 · US-30 · setup: base-users + tc-s2-114-setup · fails if another role could read any requirements route
    // Code: every route is @Roles(TECHNICAL_SUPPORT_STAFF), so RolesGuard answers 403.
    it.each(OTHER_ROLES)('refuses %s on the list, requirements and details routes (403)', async (who) => {
      await get('/equipment/requirements', who).expect(403);
      await get(`/equipment/requirements/${EVENT.allThree}`, who).expect(403);
      await get(`/equipment/requirements/${EVENT.allThree}/details`, who).expect(403);
    });

    // TC-S2-118 · US-30 · setup: base-users + tc-s2-114-setup · fails if requirements were readable without logging in
    // Code: JwtAuthGuard answers 401 without a token.
    it('refuses a request without a token (401)', async () => {
      await http().get('/equipment/requirements').expect(401);
      await http().get(`/equipment/requirements/${EVENT.allThree}/details`).expect(401);
    });
  });

  describe('"View more details": the full event, for any non-draft event', () => {
    // TC-S2-119 · US-30 (supports AC-1) · setup: base-users + tc-s2-114-setup · fails if the details view lacked the event's planning details or its Coordinator
    // Code: the details route returns the planning fields and the Coordinator's name and email.
    it('returns the full event details', async () => {
      const res = await details(EVENT.organiserOnly).expect(200);

      expect(res.body).toEqual({
        eventId: EVENT.organiserOnly,
        name: 'Organiser Only',
        description: 'Organiser Only - description',
        status: 'PLANNING',
        proposedStart: START,
        proposedEnd: END,
        expectedAttendance: 120,
        preferredLayout: 'THEATRE',
        layoutNotes: 'Stage at the front',
        accessibilityRequirements: ['STEP_FREE_ACCESS'],
        accessibilityNotes: 'Ramp at the side entrance',
        programme: '09:00 Welcome\n10:00 Talks',
        coordinator: { name: 'Cody Coordinator', email: 'coord.a@example.com' },
      });
      expect(res.headers['cache-control']).toBe('no-store');
    });

    // TC-S2-119 · US-30 · setup: base-users + tc-s2-114-setup · fails if the details of an event with any source, or none, couldn't be opened
    // Code: the details route needs a non-draft event, not requirements.
    it.each(['rowsOnly', 'notesOnly', 'allThree', 'none'] as const)('opens for the %s event', async (key) => {
      await details(EVENT[key]).expect(200);
    });

    // TC-S2-119 · US-30 · setup: base-users + tc-s2-114-setup · fails if an unknown event returned anything but 404
    // Code: no matching event reads as not found.
    it('reports an unknown event as not found (404)', async () => {
      await details('does-not-exist').expect(404);
    });

    // TC-S2-119 · US-30 · setup: base-users + tc-s2-114-setup · fails if the details view exposed requirement text or internal fields
    // Code: the details select leaves out the requirement sources and internal ids.
    it('does not expose the requirement text or internal fields', async () => {
      const res = await details(EVENT.allThree).expect(200);

      for (const field of ['equipmentNeeds', 'technicalSupportNeeds', '_count', 'organiserId']) {
        expect(res.body).not.toHaveProperty(field);
      }
    });
  });
});
