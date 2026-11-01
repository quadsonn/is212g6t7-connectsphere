import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-29 (Story 29) — Technical Support check how many units of an equipment
 * item are free for an event's date and time. Integration tests, one describe
 * per acceptance criterion.
 *
 * The code under test: GET /equipment/:id/availability?start&end&quantity ->
 * EquipmentService.checkAvailability(). CheckAvailabilityDto validates the
 * window and a whole positive quantity. The service loads the item and its
 * reservations that hold stock in the window (holdingReservationsWhere():
 * APPROVED only, overlapping as start < end AND end > start, so back-to-back
 * doesn't count). computeItemAvailability() then works out:
 *  - unavailableQuantity: all units, if the item is UNDER_MAINTENANCE or
 *    OUT_OF_SERVICE (isLendable());
 *  - reservedQuantity: the PEAK held at any one moment (peakReservedQuantity()),
 *    not the plain sum, since units are returned between reservations;
 *  - availableQuantity, fullyAvailable, and shortfall (requested - available).
 * The route is @Roles(TECHNICAL_SUPPORT_STAFF) and Cache-Control: no-store.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql and tc-s2-103-setup.sql (four items, one
 * per operational status, and an event); some tests then load the tc-s2
 * reservations script their test case names (docs/testing/sprint2-test-cases.md).
 */
describe('Story 29 check equipment availability for a date and time (integration)', () => {
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

  /** Fixed items from tc-s2-103-setup.sql. */
  const ITEM = { mic: 'EQP-004', pa: 'EQP-005', projector: 'EQP-007', reel: 'EQP-008' } as const;

  /** The event's window: 1 Oct 2030, 09:00-17:00 UTC. */
  const START = '2030-10-01T09:00:00.000Z';
  const END = '2030-10-01T17:00:00.000Z';

  const as = (who: keyof typeof USERS) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  /** Check one item for the window (by default), as Technical Support by default. */
  const check = (itemId: string, query: Record<string, string | number>, who: keyof typeof USERS = 'tech') =>
    http().get(`/equipment/${itemId}/availability`).query(query).set('Authorization', as(who));
  const window = (quantity: number) => ({ start: START, end: END, quantity });

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
    await given('base-users', 'tc-s2-103-setup');
  });

  describe('US-29 AC-1: how many units are free for the date and time', () => {
    // TC-S2-103 · US-29 AC-1 · setup: base-users + tc-s2-103-setup · fails if the free count for the window was wrong, incomplete or cacheable
    // Code: with nothing reserved and the item OPERATIONAL, all 24 units are free.
    it('returns the free count for the window', async () => {
      const res = await check(ITEM.mic, window(6)).expect(200);

      expect(res.body).toEqual({
        equipmentId: ITEM.mic,
        type: 'Wireless microphone',
        operationalStatus: 'OPERATIONAL',
        start: START,
        end: END,
        requestedQuantity: 6,
        totalQuantity: 24,
        unavailableQuantity: 0,
        reservedQuantity: 0,
        availableQuantity: 24,
        fullyAvailable: true,
        shortfall: 0,
      });
      expect(res.headers['cache-control']).toBe('no-store');
    });
  });

  describe('US-29 access: Technical Support only', () => {
    // TC-S2-104 · US-29 · setup: base-users + tc-s2-103-setup · fails if another role could check equipment availability
    // Code: the route is @Roles(TECHNICAL_SUPPORT_STAFF), so RolesGuard answers 403.
    it.each(['coordinator', 'organiser', 'attendee', 'venueStaff'] as const)('refuses %s (403)', async (who) => {
      await check(ITEM.mic, window(1), who).expect(403);
    });

    // TC-S2-104 · US-29 · setup: base-users + tc-s2-103-setup · fails if availability were readable without logging in
    // Code: JwtAuthGuard answers 401 without a token.
    it('refuses a request without a token (401)', async () => {
      await http().get(`/equipment/${ITEM.mic}/availability`).query(window(1)).expect(401);
    });
  });

  describe('US-29 AC-1: the check needs a valid window, quantity and item', () => {
    // TC-S2-105 · US-29 AC-1 · setup: base-users + tc-s2-103-setup · fails if a window ending before it starts were checked
    // Code: CheckAvailabilityDto refuses an end not after the start with 400.
    it('rejects an end that is not after the start (400)', async () => {
      const res = await check(ITEM.mic, { start: END, end: START, quantity: 1 }).expect(400);

      expect((res.body.message as string[]).join(' | ')).toMatch(/end must be later than start/);
    });

    // TC-S2-105 · US-29 AC-1 · setup: base-users + tc-s2-103-setup · fails if a missing or malformed date were accepted
    // Code: start and end must be ISO 8601 dates.
    it('rejects a missing or malformed date (400)', async () => {
      await check(ITEM.mic, { end: END, quantity: 1 }).expect(400);
      await check(ITEM.mic, { start: 'not-a-date', end: END, quantity: 1 }).expect(400);
    });

    // TC-S2-105 · US-29 AC-1 · setup: base-users + tc-s2-103-setup · fails if a zero, negative or fractional quantity were accepted
    // Code: quantity must be a whole number greater than zero.
    it.each([0, -1, 1.5])('rejects a quantity of %s (400)', async (quantity) => {
      await check(ITEM.mic, window(quantity)).expect(400);
    });

    // TC-S2-105 · US-29 AC-1 · setup: base-users + tc-s2-103-setup · fails if an unknown item returned anything but 404
    // Code: the service answers 404 when no item has that id.
    it('reports an unknown item as not found (404)', async () => {
      await check('does-not-exist', window(1)).expect(404);
    });
  });

  describe('US-29 AC-2: equipment reserved for an overlapping event is excluded', () => {
    // TC-S2-106 · US-29 AC-2 · setup: base-users + tc-s2-103-setup + tc-s2-106-setup · fails if units reserved at an overlapping time were still counted as free, or another item's reservation were subtracted
    // Code: holdingReservationsWhere() selects this item's APPROVED reservations
    // overlapping the window: the 10 mics from 12:00, not the 4 PA systems.
    it("subtracts this item's units reserved at an overlapping time, and only those", async () => {
      await given('tc-s2-106-setup');

      const res = await check(ITEM.mic, window(1)).expect(200);

      expect(res.body).toMatchObject({ reservedQuantity: 10, availableQuantity: 14 });
    });

    // TC-S2-107 · US-29 AC-2 · setup: base-users + tc-s2-103-setup + tc-s2-107-setup · fails if a reservation outside the window, or only touching it, reduced the free count
    // Code: the overlap test is start < window end AND end > window start, so touching doesn't overlap.
    it('ignores reservations at other times, including back-to-back ones', async () => {
      await given('tc-s2-107-setup');

      const res = await check(ITEM.mic, window(1)).expect(200);

      expect(res.body).toMatchObject({ reservedQuantity: 0, availableQuantity: 24 });
    });

    // TC-S2-108 · US-29 AC-2 · setup: base-users + tc-s2-103-setup + tc-s2-108-setup · fails if a requested, rejected or released reservation were treated as holding stock
    // Code: only APPROVED reservations hold units (HOLDING_STATUSES).
    it('does not count requested, rejected or released reservations', async () => {
      await given('tc-s2-108-setup');

      const res = await check(ITEM.mic, window(1)).expect(200);

      expect(res.body).toMatchObject({ reservedQuantity: 0, availableQuantity: 24 });
    });

    // TC-S2-109 · US-29 AC-2 · setup: base-users + tc-s2-103-setup + tc-s2-109-setup · fails if reservations that never overlap each other were added up
    // Code: peakReservedQuantity() takes the most in use at any one moment (10), not the sum (20).
    it('counts the peak in use, not the sum, across separate time slots', async () => {
      await given('tc-s2-109-setup');

      const res = await check(ITEM.mic, window(1)).expect(200);

      expect(res.body).toMatchObject({ reservedQuantity: 10, availableQuantity: 14 });
    });
  });

  describe('US-29 AC-3: damaged or under-maintenance equipment is excluded', () => {
    // TC-S2-110 · US-29 AC-3 · setup: base-users + tc-s2-103-setup · fails if units under maintenance or out of service were offered as free
    // Code: isLendable() is false for UNDER_MAINTENANCE and OUT_OF_SERVICE, so every unit is unavailable.
    it.each([
      ['under maintenance', ITEM.projector, 8, 'UNDER_MAINTENANCE'],
      ['damaged (out of service)', ITEM.reel, 15, 'OUT_OF_SERVICE'],
    ])('reports no free units for an item %s', async (_label, itemId, total, status) => {
      const res = await check(itemId, window(1)).expect(200);

      expect(res.body).toMatchObject({
        operationalStatus: status,
        totalQuantity: total,
        unavailableQuantity: total,
        availableQuantity: 0,
        fullyAvailable: false,
      });
    });
  });

  describe('US-29 AC-4: the shortfall when the request exceeds what is free', () => {
    // TC-S2-111 · US-29 AC-4 · setup: base-users + tc-s2-103-setup + tc-s2-106-setup · fails if a request over the free count wasn't flagged, or the shortfall was wrong
    // Code: shortfall = max(0, requested - available); fullyAvailable = shortfall is 0. 2 of 6 PA systems are free.
    it.each([
      ['below', 1, true, 0],
      ['equal to', 2, true, 0],
      ['above', 3, false, 1],
      ['well above', 6, false, 4],
    ])('a request %s the free count (%s wanted): fully available %s, shortfall %s', async (_label, quantity, fully, shortfall) => {
      await given('tc-s2-106-setup');

      const res = await check(ITEM.pa, window(quantity)).expect(200);

      expect(res.body).toMatchObject({ requestedQuantity: quantity, availableQuantity: 2, fullyAvailable: fully, shortfall });
    });

    // TC-S2-111 · US-29 AC-4 · setup: base-users + tc-s2-103-setup · fails if damaged equipment showed a smaller shortfall than the whole request
    // Code: with nothing lendable, available is 0, so the shortfall is the whole request.
    it('reports the whole request as the shortfall for damaged equipment', async () => {
      const res = await check(ITEM.reel, window(3)).expect(200);

      expect(res.body).toMatchObject({ availableQuantity: 0, shortfall: 3 });
    });
  });

  describe('US-29 AC-5: several equipment types in the same request', () => {
    // TC-S2-112 · US-29 AC-5 · setup: base-users + tc-s2-103-setup + tc-s2-106-setup · fails if checking several types for one window mixed up their counts
    // Code: the API checks one item per call; the availability page sends one
    // call per equipment row for the same window (manual TC-S2-113). Each answer
    // is that item's own, whatever else is checked alongside it.
    it('answers each type for the same window with its own count and shortfall', async () => {
      await given('tc-s2-106-setup');

      const [mic, pa, projector] = await Promise.all([
        check(ITEM.mic, window(12)).expect(200),
        check(ITEM.pa, window(3)).expect(200),
        check(ITEM.projector, window(1)).expect(200),
      ]);

      expect([mic.body, pa.body, projector.body].map((r) => [r.type, r.availableQuantity, r.shortfall])).toEqual([
        ['Wireless microphone', 14, 0],
        ['Portable PA system', 2, 1],
        ['Projector (4K)', 0, 1],
      ]);
    });
  });
});
