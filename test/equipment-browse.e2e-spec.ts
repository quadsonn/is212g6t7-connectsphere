import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-28 (Story 28) — Technical Support view the equipment catalogue to know
 * what ConnectSphere has and where it is. Integration tests, one describe per
 * acceptance criterion.
 *
 * The code under test:
 *  - GET /equipment -> EquipmentService: the list, each item as type,
 *    description, total quantity and location. BrowseEquipmentDto takes an
 *    optional `search` (case-insensitive match on type) and
 *    `sortBy` (type | location | totalQuantity) with `sortOrder`.
 *  - GET /equipment/:id -> the full item, adding operationalStatus.
 *  - Both are @Roles(TECHNICAL_SUPPORT_STAFF) and send Cache-Control: no-store,
 *    and read the table on every request, so the latest saved data shows.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql and tc-s2-97-setup.sql (three catalogue
 * items) (docs/testing/sprint2-test-cases.md).
 */
describe('Story 28 view the equipment catalogue (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';

  /** Fixed users from base-users.sql. */
  const USERS = {
    tech: 'tech.support@example.com',
    coordinator: 'coord.a@example.com',
    organiser: 'organiser@example.com',
    attendee: 'attendee@example.com',
  } as const;
  const tokens: Record<string, string> = {};

  /** Fixed items from tc-s2-97-setup.sql. */
  const ITEM = { mic: 'EQP-004', projector: 'EQP-007', table: 'EQP-012' } as const;

  const as = (who: keyof typeof USERS) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const list = (query: Record<string, string> = {}, who: keyof typeof USERS = 'tech') =>
    http().get('/equipment').query(query).set('Authorization', as(who));
  const types = (body: { type: string }[]) => body.map((item) => item.type);

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
    await given('base-users', 'tc-s2-97-setup');
  });

  describe('AC-1: every item is listed with type, description, quantity and location', () => {
    // TC-S2-97 · US-28 AC-1 · setup: base-users + tc-s2-97-setup · fails if an item was missing, or the list lacked type, description, quantity or location
    // Code: the list response maps each Equipment row to { id, type, description, location, totalQuantity }.
    it('returns every item with its key details', async () => {
      const res = await list().expect(200);

      expect(res.body).toHaveLength(3);
      expect(res.body.find((item: { id: string }) => item.id === ITEM.mic)).toEqual({
        id: ITEM.mic,
        type: 'Wireless microphone',
        description: 'Handheld UHF mic.',
        location: 'AV Store, Level 1',
        totalQuantity: 24,
      });
    });

    // TC-S2-97 · US-28 AC-1 · setup: base-users + tc-s2-97-setup · fails if an item without a description or location dropped out of the list
    // Code: description and location are optional columns, returned as null.
    it('lists an item with no description or location, showing them as empty', async () => {
      const res = await list().expect(200);

      expect(res.body.find((item: { id: string }) => item.id === ITEM.table)).toMatchObject({
        description: null,
        location: null,
      });
    });
  });

  describe('access: Technical Support only', () => {
    // TC-S2-98 · US-28 · setup: base-users + tc-s2-97-setup · fails if another role could browse the catalogue
    // Code: GET /equipment is @Roles(TECHNICAL_SUPPORT_STAFF), so RolesGuard answers 403.
    it.each(['coordinator', 'organiser', 'attendee'] as const)('refuses %s (403)', async (who) => {
      await list({}, who).expect(403);
    });

    // TC-S2-98 · US-28 · setup: base-users + tc-s2-97-setup · fails if the catalogue were readable without logging in
    // Code: JwtAuthGuard answers 401 without a token.
    it('refuses a request without a token (401)', async () => {
      await http().get('/equipment').expect(401);
    });
  });

  describe("AC-2: selecting an item shows its full details, including operational status", () => {
    // TC-S2-99 · US-28 AC-2 · setup: base-users + tc-s2-97-setup · fails if an item's detail lacked its operational status
    // Code: GET /equipment/:id returns the item with operationalStatus, which the list leaves out.
    it('includes the operational status', async () => {
      const res = await http().get(`/equipment/${ITEM.projector}`).set('Authorization', as('tech')).expect(200);

      expect(res.body).toEqual({
        id: ITEM.projector,
        type: 'Projector (4K)',
        description: 'Ceiling-mountable.',
        location: 'AV Store, Level 2',
        totalQuantity: 8,
        operationalStatus: 'UNDER_MAINTENANCE',
        // US-45: the reason for the status, once one has been recorded.
        latestStatusChange: null,
      });
      const fromList = (await list().expect(200)).body.find((item: { id: string }) => item.id === ITEM.projector);
      expect(fromList).not.toHaveProperty('operationalStatus');
    });

    // TC-S2-99 · US-28 AC-2 · setup: base-users + tc-s2-97-setup · fails if another role could open an item
    // Code: GET /equipment/:id is @Roles(TECHNICAL_SUPPORT_STAFF).
    it('refuses a Coordinator (403)', async () => {
      await http().get(`/equipment/${ITEM.mic}`).set('Authorization', as('coordinator')).expect(403);
    });

    // TC-S2-99 · US-28 AC-2 · setup: base-users + tc-s2-97-setup · fails if an unknown id returned anything but 404
    // Code: the service answers 404 when no item has that id.
    it('reports an unknown item as not found (404)', async () => {
      await http().get('/equipment/does-not-exist').set('Authorization', as('tech')).expect(404);
    });
  });

  describe('AC-3: an item can be found without scrolling the whole list', () => {
    // TC-S2-100 · US-28 AC-3 · setup: base-users + tc-s2-97-setup · fails if looking up by part of a type, in any case, missed the item or returned others
    // Code: `search` filters type with a case-insensitive contains.
    it('looks up by a case-insensitive part of the type', async () => {
      const res = await list({ search: 'PROJECTOR' }).expect(200);

      expect(types(res.body)).toEqual(['Projector (4K)']);
    });

    // TC-S2-100 · US-28 AC-3 · setup: base-users + tc-s2-97-setup · fails if a lookup with no match returned an error or other items
    // Code: no matching rows gives an empty list, still 200.
    it('returns an empty list when nothing matches', async () => {
      expect((await list({ search: 'drone' }).expect(200)).body).toEqual([]);
    });

    // TC-S2-100 · US-28 AC-3 · setup: base-users + tc-s2-97-setup · fails if sorting by type didn't put the items in alphabetical order
    // Code: sortBy=type orders by the type column.
    it('sorts by type, A to Z', async () => {
      const res = await list({ sortBy: 'type', sortOrder: 'asc' }).expect(200);

      expect(types(res.body)).toEqual(['Folding table', 'Projector (4K)', 'Wireless microphone']);
    });

    // TC-S2-100 · US-28 AC-3 · setup: base-users + tc-s2-97-setup · fails if sorting by quantity were ignored
    // Code: sortBy=totalQuantity orders by quantity, here largest first.
    it('sorts by total quantity', async () => {
      const res = await list({ sortBy: 'totalQuantity', sortOrder: 'desc' }).expect(200);

      expect(types(res.body)).toEqual(['Folding table', 'Wireless microphone', 'Projector (4K)']);
    });

    // TC-S2-100 · US-28 AC-3 · setup: base-users + tc-s2-97-setup · fails if an unknown sort field were silently ignored
    // Code: BrowseEquipmentDto checks sortBy against EquipmentSortField and answers 400.
    it('rejects a sort field outside the fixed list (400)', async () => {
      const res = await list({ sortBy: 'notAField' }).expect(400);

      expect((res.body.message as string[]).join(' | ')).toMatch(/sortBy must be one of/);
    });
  });

  describe('AC-4: the catalogue reflects the latest saved data', () => {
    // TC-S2-101 · US-28 AC-4 · setup: base-users + tc-s2-97-setup · fails if a newly saved item didn't appear on the next load, or the list could be cached
    // Code: every request reads the table, and the response is Cache-Control: no-store.
    it('shows a newly saved item on the next load, and is not cached', async () => {
      expect((await list().expect(200)).body).toHaveLength(3);

      await prisma.equipment.create({ data: { type: 'Extension reel', totalQuantity: 10 } });

      const after = await list().expect(200);
      expect(after.body).toHaveLength(4);
      expect(after.headers['cache-control']).toBe('no-store');
    });

    // TC-S2-101 · US-28 AC-4 · setup: base-users + tc-s2-97-setup · fails if an item's detail showed an out-of-date status after it was changed
    // Code: GET /equipment/:id also reads the row fresh on every request.
    it('shows a changed operational status when the item is reopened', async () => {
      await prisma.equipment.update({ where: { id: ITEM.projector }, data: { operationalStatus: 'OPERATIONAL' } });

      const res = await http().get(`/equipment/${ITEM.projector}`).set('Authorization', as('tech')).expect(200);

      expect(res.body.operationalStatus).toBe('OPERATIONAL');
      expect(res.headers['cache-control']).toBe('no-store');
    });
  });
});
