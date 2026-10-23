import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-27 (Story 27) — the Coordinator records the equipment and technical
 * support an event needs, for Technical Support to review. Integration tests,
 * one describe per acceptance criterion.
 *
 * The code under test:
 *  - PATCH /events/:id/technical-requirements -> EventsService.setTechnicalRequirements():
 *    only the assigned Coordinator, only while the event is in planning.
 *    TechnicalRequirementsDto validates each equipment line (type, whole
 *    positive quantity, optional notes); the service refuses the same type
 *    twice (assertNoDuplicateTypes, case-insensitive), replaces the whole
 *    EquipmentRequirement list when it differs, saves technicalSupportNeeds,
 *    and records what changed in the event's history (Story 25).
 *  - Technical Support read the event at RELATED scope: an event is related
 *    once it has requirement rows, technical support needs, or a reservation
 *    (RELATED_EVENT_FILTERS in AccessControlService). Attendees get the
 *    public view, which leaves the requirements out.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql and tc-s2-68-setup.sql (an event in
 * planning, assigned to USR-004); some tests then load a further tc-s2
 * script, as their test case names (docs/testing/sprint2-test-cases.md).
 */
describe('Story 27 record equipment and technical requirements (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';

  /** Fixed users from base-users.sql. */
  const USERS = {
    coordinator: 'coord.a@example.com',
    otherCoordinator: 'coord.b@example.com',
    organiser: 'organiser@example.com',
    tech: 'tech.support@example.com',
    attendee: 'attendee@example.com',
  } as const;
  const tokens: Record<string, string> = {};

  /** Fixed events from tc-s2-68/70/74/94/95-setup.sql. */
  const EVENT = {
    planning: 'EVT-105',
    approved: 'EVT-056',
    withEquipment: 'EVT-052',
    supportOnly: 'EVT-054',
    open: 'EVT-101',
  } as const;

  const as = (who: keyof typeof USERS) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  /** Save requirements, as the assigned Coordinator by default. */
  const record = (body: Record<string, unknown>, who: keyof typeof USERS = 'coordinator', eventId: string = EVENT.planning) =>
    http().patch(`/events/${eventId}/technical-requirements`).set('Authorization', as(who)).send(body);

  const EQUIPMENT = [
    { equipmentType: 'Laser projector', quantity: 2 },
    { equipmentType: 'Wireless microphone', quantity: 6, notes: 'Lapel' },
  ];

  const rows = () => prisma.equipmentRequirement.count({ where: { eventId: EVENT.planning } });

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
    await given('base-users', 'tc-s2-68-setup');
  });

  describe('AC-1: required equipment (type and quantity) is saved', () => {
    // TC-S2-89 · US-27 AC-1 · setup: base-users + tc-s2-68-setup · fails if an equipment line wasn't saved against the event, or lost its quantity or notes
    // Code: setTechnicalRequirements() writes one EquipmentRequirement row per line and returns them.
    it('saves each line against the event', async () => {
      const res = await record({ equipment: EQUIPMENT }).expect(200);

      expect(
        res.body.equipmentRequirements.map((r: { equipmentType: string; quantity: number; notes: string | null }) => [
          r.equipmentType,
          r.quantity,
          r.notes,
        ]),
      ).toEqual([
        ['Laser projector', 2, null],
        ['Wireless microphone', 6, 'Lapel'],
      ]);
      expect(await rows()).toBe(2);
    });

    // TC-S2-89 · US-27 AC-1 · setup: base-users + tc-s2-68-setup · fails if a later save added to the old list instead of replacing it
    // Code: the list is replaced wholesale (deleteMany, then createMany) when it differs.
    it('replaces the list on a later save', async () => {
      await record({ equipment: EQUIPMENT }).expect(200);

      const res = await record({ equipment: [{ equipmentType: 'Laser projector', quantity: 3 }] }).expect(200);

      expect(res.body.equipmentRequirements).toEqual([expect.objectContaining({ equipmentType: 'Laser projector', quantity: 3 })]);
      expect(await rows()).toBe(1);
    });

    // TC-S2-89 · US-27 AC-1 · setup: base-users + tc-s2-68-setup · fails if the Coordinator couldn't clear the list
    // Code: an empty list differs from the stored one, so every row is deleted.
    it('clears the list when sent empty', async () => {
      await record({ equipment: EQUIPMENT }).expect(200);

      await record({ equipment: [] }).expect(200);

      expect(await rows()).toBe(0);
    });
  });

  describe('AC-1: invalid equipment lines are refused', () => {
    // TC-S2-90 · US-27 AC-1 · setup: base-users + tc-s2-68-setup · fails if a line without a type, or with a zero or fractional quantity, were saved
    // Code: EquipmentRequirementDto (@IsNotEmpty type, @IsInt @IsPositive quantity) answers 400.
    it.each([
      ['a missing type', { equipmentType: '', quantity: 1 }],
      ['a zero quantity', { equipmentType: 'Mic', quantity: 0 }],
      ['a fractional quantity', { equipmentType: 'Mic', quantity: 1.5 }],
    ])('rejects %s (400) and saves nothing', async (_case, line) => {
      await record({ equipment: [line] }).expect(400);

      expect(await rows()).toBe(0);
    });

    // TC-S2-90 · US-27 AC-1 · setup: base-users + tc-s2-68-setup · fails if a type made only of spaces counted as a type
    // Code: EquipmentRequirementDto trims equipmentType (@Trim()) before
    // @IsNotEmpty() checks it, so '   ' is refused like an empty type.
    it('US-27 AC-1: whitespace-only equipment type refused', async () => {
      const res = await record({ equipment: [{ equipmentType: '   ', quantity: 1 }] }).expect(400);

      expect(res.body.message).toEqual([expect.stringContaining('equipmentType is required')]);
      expect(await rows()).toBe(0);
    });

    // TC-S2-90 · US-27 AC-1 · setup: base-users + tc-s2-68-setup · fails if a type with surrounding spaces were refused, or saved with the spaces
    // Code: @Trim() keeps the words and drops only the surrounding spaces.
    it('US-27 AC-1: a normal equipment type is still saved, trimmed', async () => {
      const res = await record({ equipment: [{ equipmentType: '  Laser projector  ', quantity: 2 }] }).expect(200);

      expect(res.body.equipmentRequirements).toEqual([
        expect.objectContaining({ equipmentType: 'Laser projector', quantity: 2 }),
      ]);
      expect(await rows()).toBe(1);
    });

    // TC-S2-90 · US-27 AC-1 · setup: base-users + tc-s2-68-setup · fails if the same type could be listed twice, leaving Technical Support unsure of the total
    // Code: assertNoDuplicateTypes() compares types case-insensitively and answers 400.
    it('rejects the same type twice, whatever its case (400)', async () => {
      const res = await record({
        equipment: [
          { equipmentType: 'Mic', quantity: 1 },
          { equipmentType: 'mic', quantity: 2 },
        ],
      }).expect(400);

      expect(res.body.message).toEqual([expect.stringContaining('listed more than once')]);
    });
  });

  describe('AC-1: equipment is picked from the catalogue', () => {
    // US-27 AC-1 · setup: base-users + tc-s2-68-setup · fails if the Coordinator couldn't load the catalogue to pick from
    // Code: GET /events/equipment-catalogue is @Roles(EVENT_ORGANISER, EVENT_COORDINATOR).
    it('lets the Coordinator list the catalogue', async () => {
      const projector = await prisma.equipment.create({
        data: { type: 'Laser projector', location: 'AV store', totalQuantity: 4 },
      });

      const res = await http().get('/events/equipment-catalogue').set('Authorization', as('coordinator')).expect(200);

      expect(res.body).toEqual([{ id: projector.id, type: 'Laser projector', description: null, location: 'AV store' }]);
    });

    // US-27 AC-1 · setup: base-users + tc-s2-68-setup · fails if a role with no picker could read the catalogue through this route
    // Code: RolesGuard answers 403 to anyone but Organisers and Coordinators.
    it.each(['tech', 'attendee'] as const)('refuses %s (403)', async (who) => {
      await http().get('/events/equipment-catalogue').set('Authorization', as(who)).expect(403);
    });

    // US-27 AC-1 · setup: base-users + tc-s2-68-setup · fails if a picked item wasn't linked to the catalogue, or kept a name other than the catalogue's
    // Code: setTechnicalRequirements() names a line with an equipmentId after its catalogue item.
    it('saves a picked item linked to the catalogue, under its catalogue name', async () => {
      const projector = await prisma.equipment.create({
        data: { type: 'Laser projector', location: 'AV store', totalQuantity: 4 },
      });

      await record({
        equipment: [
          { equipmentId: projector.id, equipmentType: 'projector', quantity: 2 },
          { equipmentType: 'Smoke machine', quantity: 1 },
        ],
      }).expect(200);

      const saved = await prisma.equipmentRequirement.findMany({
        where: { eventId: EVENT.planning },
        orderBy: { equipmentType: 'asc' },
        select: { equipmentId: true, equipmentType: true, quantity: true },
      });
      expect(saved).toEqual([
        { equipmentId: projector.id, equipmentType: 'Laser projector', quantity: 2 },
        { equipmentId: null, equipmentType: 'Smoke machine', quantity: 1 },
      ]);
    });
  });

  describe('AC-2: technical support needed is saved', () => {
    // TC-S2-91 · US-27 AC-2 · setup: base-users + tc-s2-68-setup · fails if the technical support description wasn't saved against the event
    // Code: setTechnicalRequirements() saves the trimmed text to technicalSupportNeeds.
    it('saves the description against the event', async () => {
      const res = await record({ technicalSupportNeeds: 'On-site AV technician; hybrid setup with Zoom' }).expect(200);

      expect(res.body.technicalSupportNeeds).toBe('On-site AV technician; hybrid setup with Zoom');
      const stored = await prisma.eventRequest.findUniqueOrThrow({ where: { id: EVENT.planning } });
      expect(stored.technicalSupportNeeds).toBe('On-site AV technician; hybrid setup with Zoom');
    });
  });

  describe('"Given the Event Coordinator is planning an event": who and when', () => {
    // TC-S2-92 · US-27 AC-1, AC-2 · setup: base-users + tc-s2-68-setup + tc-s2-70-setup · fails if requirements could be recorded before planning starts
    // Code: assertInPlanning() answers 409 outside PLANNING_STATUSES.
    it('refuses an event that is not in planning (409)', async () => {
      await given('tc-s2-70-setup');

      await record({ equipment: EQUIPMENT }, 'coordinator', EVENT.approved).expect(409);
    });

    // TC-S2-92 · US-27 AC-1, AC-2 · setup: base-users + tc-s2-68-setup · fails if a Coordinator could record requirements for an event assigned to someone else
    // Code: assertEventAccess() hides events outside the caller's ASSIGNED scope as 404.
    it('hides the event from a Coordinator it is not assigned to (404)', async () => {
      await record({ equipment: EQUIPMENT }, 'otherCoordinator').expect(404);
    });

    // TC-S2-92 · US-27 AC-1, AC-2 · setup: base-users + tc-s2-68-setup · fails if Technical Support or the Organiser could record the requirements
    // Code: the route is @Roles(EVENT_COORDINATOR), so RolesGuard answers 403.
    it.each(['tech', 'organiser'] as const)('refuses %s (403)', async (who) => {
      await record({ equipment: EQUIPMENT }, who).expect(403);
      expect(await rows()).toBe(0);
    });
  });

  describe('AC-3: Technical Support see the recorded requirements', () => {
    // TC-S2-93 · US-27 AC-3 · setup: base-users + tc-s2-68-setup · fails if Technical Support couldn't see the recorded equipment or support needs on the event
    // Code: recorded requirements make the event RELATED for Technical Support,
    // and GET /events/:id includes them for that role.
    it('shows them on the event', async () => {
      await record({ equipment: EQUIPMENT, technicalSupportNeeds: 'Hybrid setup' }).expect(200);

      const res = await http().get(`/events/${EVENT.planning}`).set('Authorization', as('tech')).expect(200);

      expect(res.body.technicalSupportNeeds).toBe('Hybrid setup');
      expect(res.body.equipmentRequirements.map((r: { equipmentType: string }) => r.equipmentType)).toEqual([
        'Laser projector',
        'Wireless microphone',
      ]);
    });

    // TC-S2-93 · US-27 AC-3 · setup: base-users + tc-s2-68-setup · fails if the Coordinator's own detail view left the requirements out
    // Code: GET /events/assigned/:id returns the event with its requirement rows.
    it('shows them to the Coordinator on the detail view', async () => {
      await record({ equipment: EQUIPMENT }).expect(200);

      const res = await http().get(`/events/assigned/${EVENT.planning}`).set('Authorization', as('coordinator')).expect(200);

      expect(res.body.equipmentRequirements).toHaveLength(2);
    });

    // TC-S2-94 · US-27 AC-3 · setup: base-users + tc-s2-68-setup + tc-s2-94-setup · fails if an event with recorded requirements was missing from Technical Support's list, or one with none was shown
    // Code: RELATED_EVENT_FILTERS lists an event with requirement rows or technical
    // support needs, even with nothing reserved. The tc-s2-68 event has only the
    // Organiser's free-text equipment notes, which don't count.
    it('lists an event once it has requirements, even with nothing reserved', async () => {
      await given('tc-s2-94-setup');
      await record({ equipment: EQUIPMENT }, 'coordinator', EVENT.withEquipment).expect(200);
      await record({ technicalSupportNeeds: 'Technician' }, 'coordinator', EVENT.supportOnly).expect(200);

      const res = await http().get('/events').set('Authorization', as('tech')).expect(200);

      expect(res.body.map((e: { id: string }) => e.id).sort()).toEqual([EVENT.withEquipment, EVENT.supportOnly].sort());
    });

    // TC-S2-94 · US-27 AC-3 · setup: base-users + tc-s2-68-setup + tc-s2-74-setup · fails if an event with only a reservation dropped out of Technical Support's list
    // Code: an equipment reservation also makes the event RELATED.
    it('still lists an event that only has a reservation', async () => {
      await given('tc-s2-74-setup');

      const res = await http().get('/events').set('Authorization', as('tech')).expect(200);

      expect(res.body.map((e: { id: string }) => e.id)).toEqual([EVENT.planning]);
    });

    // TC-S2-95 · US-27 AC-3 · setup: base-users + tc-s2-68-setup + tc-s2-95-setup · fails if an Attendee could see the internal equipment or support requirements
    // Code: Attendees get the public event view, which has no requirement fields.
    it('never shows them to an Attendee', async () => {
      await given('tc-s2-95-setup');
      await record({ equipment: EQUIPMENT, technicalSupportNeeds: 'Hybrid' }, 'coordinator', EVENT.open).expect(200);

      const res = await http().get(`/events/${EVENT.open}`).set('Authorization', as('attendee')).expect(200);

      expect(res.body.equipmentRequirements).toBeUndefined();
      expect(res.body.technicalSupportNeeds).toBeUndefined();
    });
  });

  describe('history (with Story 25)', () => {
    // TC-S2-96 · US-27 AC-1, AC-2 (US-25 AC-2) · setup: base-users + tc-s2-68-setup · fails if a requirements save left no history entry, or the entry lacked the before and after
    // Code: setTechnicalRequirements() records each changed part through recordChange(),
    // describing equipment lines as "<quantity> × <type> (<notes>)".
    it('records each save with the before and after', async () => {
      await record({ equipment: EQUIPMENT }).expect(200);
      await record({ equipment: [{ equipmentType: 'Laser projector', quantity: 3 }], technicalSupportNeeds: 'Hybrid' }).expect(200);

      const res = await http().get(`/events/${EVENT.planning}/history`).set('Authorization', as('coordinator')).expect(200);

      expect(res.body.entries).toHaveLength(2);
      expect(res.body.entries[1].changes).toEqual([
        {
          field: 'equipmentRequirements',
          previous: ['2 × Laser projector', '6 × Wireless microphone (Lapel)'],
          next: ['3 × Laser projector'],
        },
        { field: 'technicalSupportNeeds', previous: null, next: 'Hybrid' },
      ]);
    });
  });
});
