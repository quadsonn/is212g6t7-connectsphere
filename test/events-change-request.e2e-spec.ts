import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ChangeRequestStatus, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-36 (Story 36) — an Organiser requests a change to their event's date,
 * time, expected attendance or equipment, for ConnectSphere to review.
 * Integration tests, one describe per acceptance criterion.
 *
 * The code under test:
 *  - GET /events/:id (as the Organiser): the event's current dates,
 *    attendance and equipment lines, plus pendingChangeRequest beside them.
 *  - GET /events/equipment-catalogue: the catalogue as the form's picker
 *    (id, type, description, location), @Roles(EVENT_ORGANISER).
 *  - POST /events/:id/change-requests -> EventsChangeRequestService.request(),
 *    @Roles(EVENT_ORGANISER). CreateChangeRequestDto checks the shape (reason
 *    required and trimmed; dates valid, end after start; attendance and
 *    quantities whole and positive). assertEventAccess() hides another
 *    Organiser's event (404); isChangeable() allows SUBMITTED through
 *    CONFIRMED only (409 otherwise). evaluateChangeRequest() in
 *    change-request.rules.ts compares with the event: dates not in the past,
 *    end after the start the event would have, no duplicate items, and at
 *    least one field different. Equipment must be in the catalogue
 *    (assertInCatalogue). Only one PENDING request per event (409, backed by a
 *    partial unique index). The request is saved as PENDING storing only the
 *    fields that differ; the event itself is not edited.
 *
 * Dates are fixed far from today (2030 for valid ones, 2020 for past ones), so
 * no clock is frozen.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql and tc-s2-159-setup.sql (a catalogue and a
 * submitted event with equipment); some tests then load a further tc-s2
 * script, as their test case names (docs/testing/sprint2-test-cases.md).
 */
describe('Story 36 request an event change (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';

  /** Fixed users: base-users.sql, plus USR-008 from tc-s2-170-setup.sql. */
  const USERS = {
    organiser: 'organiser@example.com',
    oscar: 'other.organiser@example.com',
    coordinator: 'coord.a@example.com',
    attendee: 'attendee@example.com',
  } as const;
  const tokens: Record<string, string> = {};

  /** Fixed rows from tc-s2-159/169/170-setup.sql. */
  const EVENT = 'EVT-063';
  const ITEM = { projector: 'EQP-002', mic: 'EQP-001', screen: 'EQP-003' } as const;
  /** tc-s2-169-setup.sql: one of USR-006's events per status a change can't be requested for. */
  const UNCHANGEABLE_EVENT: Record<string, string> = {
    DRAFT: 'EVT-068',
    CANCELLED: 'EVT-064',
    COMPLETED: 'EVT-065',
    REJECTED: 'EVT-071',
  };
  const NO_DIFFERENCE = 'at least one field must differ from the event’s current value';

  const as = (who: keyof typeof USERS) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  /** Request a change, with a reason, as the event's Organiser by default. */
  const requestChange = (body: Record<string, unknown>, who: keyof typeof USERS = 'organiser', eventId: string = EVENT) =>
    http()
      .post(`/events/${eventId}/change-requests`)
      .set('Authorization', as(who))
      .send({ reason: 'Venue needs it', ...body });

  const saved = () => prisma.eventChangeRequest.findMany({ where: { eventId: EVENT }, include: { equipment: true } });

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
    await given('base-users', 'tc-s2-159-setup', 'tc-s2-170-setup');
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
    await given('base-users', 'tc-s2-159-setup');
  });

  describe('AC-1: the form shows the current date, time, attendance and equipment, from the catalogue', () => {
    // TC-S2-159 · US-36 AC-1 · setup: base-users + tc-s2-159-setup · fails if the Organiser couldn't see the event's current date, time, attendance or equipment to edit
    // Code: GET /events/:id for the Organiser includes the dates, attendance and equipment lines.
    it("shows the event's current values", async () => {
      const res = await http().get(`/events/${EVENT}`).set('Authorization', as('organiser')).expect(200);

      expect(res.body).toMatchObject({
        proposedStart: '2030-10-01T09:00:00.000Z',
        proposedEnd: '2030-10-01T17:00:00.000Z',
        expectedAttendance: 120,
        pendingChangeRequest: null,
      });
      expect(
        res.body.equipmentRequirements.map((r: { equipmentId: string | null; equipmentType: string; quantity: number }) => [
          r.equipmentId,
          r.equipmentType,
          r.quantity,
        ]),
      ).toEqual([
        [ITEM.projector, 'Projector', 2],
        [null, 'Banner stand', 1],
      ]);
    });

    // TC-S2-159 · US-36 AC-1, AC-6 · setup: base-users + tc-s2-159-setup · fails if the Organiser had no catalogue to pick equipment from, or it exposed stock levels
    // Code: listCatalogue() returns only id, type, description and location, by type.
    it('offers the equipment catalogue to pick from', async () => {
      const res = await http().get('/events/equipment-catalogue').set('Authorization', as('organiser')).expect(200);

      expect(res.body).toEqual([
        { id: ITEM.screen, type: 'Projection screen', description: null, location: null },
        { id: ITEM.projector, type: 'Projector', description: 'Ceiling projector', location: 'AV Store' },
        { id: ITEM.mic, type: 'Wireless microphone', description: 'Handheld', location: 'AV Store' },
      ]);
    });
  });

  describe('AC-1: a reason is required', () => {
    // TC-S2-160 · US-36 AC-1 · setup: base-users + tc-s2-159-setup · fails if a change request without a real reason were accepted
    // Code: CreateChangeRequestDto trims the reason, then requires it.
    it.each([
      ['no reason', { reason: undefined }],
      ['an empty reason', { reason: '' }],
      ['a reason of only spaces', { reason: '   ' }],
    ])('refuses %s (400) and saves nothing', async (_case, body) => {
      const res = await requestChange({ proposedAttendance: 150, ...body }).expect(400);

      expect(res.body.message).toContain('reason is required');
      expect(await saved()).toEqual([]);
    });
  });

  describe('AC-2: at least one field must differ from the current value', () => {
    // TC-S2-161 · US-36 AC-2 · setup: base-users + tc-s2-159-setup · fails if a request that changes nothing were accepted
    // Code: evaluateChangeRequest() compares each sent field with the event and
    // adds NO_DIFFERENCE_MESSAGE when none differs. Equipment is compared as a
    // set of (item, quantity), so order doesn't matter.
    it.each([
      ['nothing proposed', {}],
      ['the same attendance', { proposedAttendance: 120 }],
      ['the same dates', { proposedStart: '2030-10-01T09:00:00.000Z', proposedEnd: '2030-10-01T17:00:00.000Z' }],
      ['the same equipment', { equipment: [{ equipmentId: 'EQP-002', quantity: 2 }] }],
    ])('refuses %s (400)', async (_case, body) => {
      const res = await requestChange(body).expect(400);

      expect(res.body.message).toContain(NO_DIFFERENCE);
      expect(await saved()).toEqual([]);
    });
  });

  describe('AC-3: proposed dates cannot be in the past, and the end must be after the start', () => {
    // TC-S2-162 · US-36 AC-3 · setup: base-users + tc-s2-159-setup · fails if a date in the past, or an end not after the start, were accepted
    // Code: the DTO checks valid dates and end after a sent start; the rules
    // check the past, and the end against the start the event would have.
    it.each([
      ['a start in the past', { proposedStart: '2020-01-01T09:00:00.000Z' }, 'proposedStart must be in the future'],
      ['an end in the past', { proposedEnd: '2020-01-01T17:00:00.000Z' }, 'proposedEnd must be in the future'],
      [
        'an end before the proposed start',
        { proposedStart: '2030-10-02T17:00:00.000Z', proposedEnd: '2030-10-02T09:00:00.000Z' },
        'proposedEnd must be later than proposedStart',
      ],
      ['an end before the current start', { proposedEnd: '2030-10-01T08:00:00.000Z' }, 'proposedEnd must be later than proposedStart'],
      ['a start after the current end', { proposedStart: '2030-10-01T18:00:00.000Z' }, 'proposedEnd must be later than proposedStart'],
      ['a date that is not a date', { proposedStart: 'next Tuesday' }, 'proposedStart must be a valid ISO 8601 date'],
    ])('refuses %s (400)', async (_case, body, message) => {
      const res = await requestChange(body).expect(400);

      expect(res.body.message).toContain(message);
      expect(await saved()).toEqual([]);
    });

    // TC-S2-162 · US-36 AC-3 · setup: base-users + tc-s2-159-setup · fails if a valid new date and time were refused
    // Code: future dates with the end after the start pass every check.
    it('accepts a new date and time in the future', async () => {
      await requestChange({ proposedStart: '2030-10-02T10:00:00.000Z', proposedEnd: '2030-10-02T18:00:00.000Z' }).expect(201);
    });
  });

  describe('AC-4: expected attendance must be a positive whole number', () => {
    // TC-S2-163 · US-36 AC-4 · setup: base-users + tc-s2-159-setup · fails if a zero, negative, fractional or non-numeric attendance were accepted
    // Code: CreateChangeRequestDto (@IsInt, @IsPositive) answers 400.
    it.each([0, -5, 2.5, 'lots'])('refuses %p (400)', async (proposedAttendance) => {
      await requestChange({ proposedAttendance }).expect(400);

      expect(await saved()).toEqual([]);
    });
  });

  describe('AC-5: equipment changes can add items, remove items and change quantities', () => {
    // TC-S2-164 · US-36 AC-5 · setup: base-users + tc-s2-159-setup · fails if adding an item and changing a quantity in one request weren't saved as the new list
    // Code: `equipment` is the complete new list; it differs from the current set, so it is stored line by line.
    it('saves a new list that changes a quantity and adds an item', async () => {
      const res = await requestChange({
        equipment: [
          { equipmentId: ITEM.projector, quantity: 3 },
          { equipmentId: ITEM.mic, quantity: 4 },
        ],
      }).expect(201);

      expect(res.body.equipmentChanged).toBe(true);
      expect(res.body.equipment.map((l: { equipmentId: string; quantity: number }) => [l.equipmentId, l.quantity]).sort()).toEqual(
        [
          [ITEM.mic, 4],
          [ITEM.projector, 3],
        ].sort(),
      );
    });

    // TC-S2-164 · US-36 AC-5 · setup: base-users + tc-s2-159-setup · fails if removing every item couldn't be requested
    // Code: an empty list means "remove everything", and still differs from the current list.
    it('saves a request to remove every item', async () => {
      const res = await requestChange({ equipment: [] }).expect(201);

      expect(res.body).toMatchObject({ equipmentChanged: true, equipment: [] });
    });
  });

  describe('AC-6: equipment items are selected from the catalogue', () => {
    // TC-S2-165 · US-36 AC-6 · setup: base-users + tc-s2-159-setup · fails if an item not in the catalogue could be requested
    // Code: assertInCatalogue() answers 400 naming each unknown item.
    it('refuses an item that is not in the catalogue (400)', async () => {
      const res = await requestChange({ equipment: [{ equipmentId: 'q-s2-cr-hoverboard', quantity: 1 }] }).expect(400);

      expect(res.body.message).toEqual(['equipment item q-s2-cr-hoverboard is not in the catalogue']);
      expect(await saved()).toEqual([]);
    });

    // TC-S2-165 · US-36 AC-6 · setup: base-users + tc-s2-159-setup · fails if the same item could appear twice in one list
    // Code: evaluateChangeRequest() refuses a repeated equipmentId.
    it('refuses the same item twice (400)', async () => {
      const res = await requestChange({
        equipment: [
          { equipmentId: ITEM.mic, quantity: 1 },
          { equipmentId: ITEM.mic, quantity: 2 },
        ],
      }).expect(400);

      expect(res.body.message).toContain(`equipment item ${ITEM.mic} is listed more than once; combine the quantities`);
    });
  });

  describe('AC-7: equipment quantities must be positive whole numbers', () => {
    // TC-S2-166 · US-36 AC-7 · setup: base-users + tc-s2-159-setup · fails if an equipment line with a zero, negative or fractional quantity were accepted
    // Code: ChangeRequestEquipmentDto (@IsInt, @IsPositive) answers 400.
    it.each([0, -1, 1.5])('refuses a quantity of %p (400)', async (quantity) => {
      await requestChange({ equipment: [{ equipmentId: ITEM.mic, quantity }] }).expect(400);

      expect(await saved()).toEqual([]);
    });
  });

  describe('AC-8: a submitted request is saved as Pending and linked to the event', () => {
    // TC-S2-167 · US-36 AC-8 · setup: base-users + tc-s2-159-setup · fails if the request wasn't saved as PENDING on the event, or stored fields that didn't change
    // Code: request() creates an EventChangeRequest with status PENDING, the
    // reason, and only the fields that differ (the unchanged start is null).
    it('saves it as PENDING on the event, storing only what changes', async () => {
      const res = await requestChange({ proposedAttendance: 150, proposedStart: '2030-10-01T09:00:00.000Z' }).expect(201);

      expect(res.body).toMatchObject({
        eventId: EVENT,
        requestedById: 'USR-006',
        status: ChangeRequestStatus.PENDING,
        reason: 'Venue needs it',
        proposedAttendance: 150,
        proposedStart: null,
        proposedEnd: null,
        equipmentChanged: false,
      });
      expect(await saved()).toHaveLength(1);
    });

    // TC-S2-167 · US-36 AC-8 · setup: base-users + tc-s2-159-setup · fails if an event could have two undecided change requests at once
    // Code: findPending() refuses a second request with 409 until the first is decided.
    it('refuses a second request while one is pending (409)', async () => {
      await requestChange({ proposedAttendance: 150 }).expect(201);

      const res = await requestChange({ proposedAttendance: 160 }).expect(409);

      expect(res.body.message).toBe('this event already has a pending change request; wait for it to be decided');
    });

    // TC-S2-167 · US-36 AC-8 · setup: base-users + tc-s2-159-setup · fails if two requests sent at the same moment both became pending
    // Code: the partial unique index (one PENDING per event) makes the loser fail; the service turns that into 409.
    it('lets only one of two simultaneous requests through', async () => {
      const results = await Promise.all([requestChange({ proposedAttendance: 150 }), requestChange({ proposedAttendance: 160 })]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await saved()).toHaveLength(1);
    });
  });

  describe('AC-9: the original details still show, with the pending request alongside', () => {
    // TC-S2-168 · US-36 AC-9 · setup: base-users + tc-s2-159-setup · fails if requesting a change edited the event, or the pending request wasn't shown beside it
    // Code: request() never writes the event; GET /events/:id adds pendingChangeRequest for the Organiser.
    it('keeps the event as it was and shows the request beside it', async () => {
      await requestChange({ proposedAttendance: 150, proposedStart: '2030-10-02T09:00:00.000Z', proposedEnd: '2030-10-02T17:00:00.000Z' }).expect(201);

      const res = await http().get(`/events/${EVENT}`).set('Authorization', as('organiser')).expect(200);

      expect(res.body).toMatchObject({
        expectedAttendance: 120,
        proposedStart: '2030-10-01T09:00:00.000Z',
        pendingChangeRequest: {
          status: 'PENDING',
          proposedAttendance: 150,
          proposedStart: '2030-10-02T09:00:00.000Z',
          reason: 'Venue needs it',
        },
      });
    });
  });

  describe('AC-10: only for submitted or confirmed events, not cancelled, completed or rejected ones', () => {
    // TC-S2-169 · US-36 AC-10 · setup: base-users + tc-s2-159-setup + tc-s2-169-setup · fails if a confirmed event couldn't have a change requested
    // Code: CONFIRMED is in CHANGEABLE_STATUSES.
    it('accepts a request for a confirmed event', async () => {
      await given('tc-s2-169-setup');

      await requestChange({ proposedAttendance: 150 }, 'organiser', 'EVT-066').expect(201);
    });

    // TC-S2-169 · US-36 AC-10 · setup: base-users + tc-s2-159-setup + tc-s2-169-setup · fails if a change could be requested for a draft, cancelled, completed or rejected event
    // Code: isChangeable() is false outside SUBMITTED..CONFIRMED, so request() answers 409.
    it.each(['DRAFT', 'CANCELLED', 'COMPLETED', 'REJECTED'])('refuses a %s event (409)', async (status) => {
      await given('tc-s2-169-setup');

      const res = await requestChange({ proposedAttendance: 150 }, 'organiser', UNCHANGEABLE_EVENT[status]).expect(409);

      expect(res.body.message).toBe(`event is ${status}; change requests are only available for submitted or confirmed events`);
    });
  });

  describe('AC-11: Organisers can only request changes to their own events', () => {
    // TC-S2-170 · US-36 AC-11 · setup: base-users + tc-s2-159-setup + tc-s2-170-setup · fails if an Organiser could request a change to someone else's event
    // Code: assertEventAccess() with the Organiser's OWN scope hides other events as 404.
    it("hides another Organiser's event (404)", async () => {
      await given('tc-s2-170-setup');

      await requestChange({ proposedAttendance: 150 }, 'oscar').expect(404);
      expect(await saved()).toEqual([]);
    });

    // TC-S2-170 · US-36 AC-11 · setup: base-users + tc-s2-159-setup + tc-s2-170-setup · fails if an Organiser couldn't request a change to their own event
    // Code: the same check passes for the Organiser's own event.
    it('accepts the Organiser\'s own event', async () => {
      await given('tc-s2-170-setup');

      await requestChange({ proposedAttendance: 150 }, 'oscar', 'EVT-070').expect(201);
    });

    // TC-S2-170 · US-36 AC-11 · setup: base-users + tc-s2-159-setup · fails if another role could request a change
    // Code: the route is @Roles(EVENT_ORGANISER), so RolesGuard answers 403.
    it.each(['coordinator', 'attendee'] as const)('refuses %s (403)', async (who) => {
      await requestChange({ proposedAttendance: 150 }, who).expect(403);
    });
  });
});
