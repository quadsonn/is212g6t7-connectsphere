import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventStatus, NotificationType, PrismaClient, ReservationStatus } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { EquipmentReservationsService } from '../src/equipment/equipment-reservations.service';
import { EventsService } from '../src/events/events.service';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-31 (Story 31) — Technical Support commit a quantity of an item to an
 * event, locking it for that period.
 * US-32 (Story 32) — reservations are released when their event is cancelled.
 * Integration tests, one describe per acceptance criterion. Both stories read
 * and write the same reservations as Story 29's availability check, so some
 * tests check all three together.
 *
 * The code under test:
 *  - POST /equipment/reservations -> EquipmentReservationsService.commit():
 *    @Roles(TECHNICAL_SUPPORT_STAFF). The event must be in a status equipment
 *    can be committed to (not draft, rejected, cancelled or completed). Under
 *    a row lock on the item, it works out what is free for the event's own
 *    window (the same availability rules as Story 29) and either refuses with
 *    409 and a reason that states the counts, or creates an APPROVED
 *    reservation and notifies the event's Coordinator.
 *  - EventsService.setStatus(event, CANCELLED) -> releaseForCancelledEvent():
 *    in the same transaction, every REQUESTED or APPROVED reservation of that
 *    event becomes RELEASED with releasedAt; REJECTED and already-RELEASED
 *    ones are left alone (RELEASABLE_STATUSES).
 *  - GET /equipment/reservations/released: the released reservations, with
 *    equipment and the cancelled event.
 *
 * Code gap: no endpoint cancels an event yet, so these tests cancel through
 * EventsService.setStatus(), the only sanctioned writer of an event's status.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql and tc-s2-122-setup.sql (three items and
 * four events placed around one another); some tests then load a further
 * tc-s2 script, as their test case names (docs/testing/sprint2-test-cases.md).
 */
describe('Story 31 reserve equipment / Story 32 release for a cancelled event (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let events: EventsService;

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

  /** Fixed rows from tc-s2-122-setup.sql (and tc-s2-123/129/130/134). */
  const ITEM = { mic: 'q-s2-res-mic', pa: 'q-s2-res-pa', projector: 'q-s2-res-projector' } as const;
  const EVENT = {
    capstone: 'e-s2-capstone', // 09:00-17:00, the main event
    overlapping: 'e-s2-industry', // 12:00-20:00
    backToBack: 'e-s2-mixer', // 17:00-21:00
    nextDay: 'e-s2-alumni',
  } as const;

  /** The main event's window: 1 Oct 2030, 09:00-17:00 UTC. */
  const START = '2030-10-01T09:00:00.000Z';
  const END = '2030-10-01T17:00:00.000Z';

  const as = (who: keyof typeof USERS) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  /** Commit `quantity` of an item to an event, as Technical Support by default. */
  const commit = (eventId: string, equipmentId: string, quantity: unknown, who: keyof typeof USERS = 'tech') =>
    http().post('/equipment/reservations').set('Authorization', as(who)).send({ eventId, equipmentId, quantity });

  const availability = (equipmentId: string, quantity: number, start = START, end = END) =>
    http().get(`/equipment/${equipmentId}/availability`).query({ start, end, quantity }).set('Authorization', as('tech'));

  const released = (who: keyof typeof USERS = 'tech') =>
    http().get('/equipment/reservations/released').set('Authorization', as(who));

  /** Cancel an event the only way the app can: through setStatus(). */
  const cancel = async (eventId: string) =>
    events.setStatus(await prisma.eventRequest.findUniqueOrThrow({ where: { id: eventId } }), EventStatus.CANCELLED);

  const reservationsOf = (eventId: string) => prisma.equipmentReservation.findMany({ where: { eventId } });

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
    events = app.get(EventsService);

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
    await given('base-users', 'tc-s2-122-setup');
  });

  // ---------------------------------------------------------------------------
  // Story 31: reserve available equipment for an event
  // ---------------------------------------------------------------------------

  describe('US-31 AC-1: an item and quantity can be committed to an event for its date and time', () => {
    // TC-S2-122 · US-31 AC-1 · setup: base-users + tc-s2-122-setup · fails if a commitment wasn't saved for the event's own window, or wasn't locked in (APPROVED)
    // Code: commit() takes the window from the event and creates an APPROVED reservation.
    it("commits the quantity over the event's own window", async () => {
      const res = await commit(EVENT.capstone, ITEM.mic, 4).expect(201);

      expect(res.body).toMatchObject({
        eventId: EVENT.capstone,
        equipmentId: ITEM.mic,
        quantity: 4,
        start: START,
        end: END,
        status: 'APPROVED',
        equipment: { id: ITEM.mic, type: 'Wireless microphone' },
      });
      const row = await prisma.equipmentReservation.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.status).toBe(ReservationStatus.APPROVED);
    });

    // TC-S2-123 · US-31 AC-1 · setup: base-users + tc-s2-122-setup + tc-s2-123-setup · fails if equipment could be committed to an event that isn't live
    // Code: the event's status must be one equipment can be committed to; otherwise 409 naming the status.
    it.each([EventStatus.DRAFT, EventStatus.REJECTED, EventStatus.CANCELLED, EventStatus.COMPLETED])(
      'refuses a %s event (409)',
      async (status) => {
        await given('tc-s2-123-setup');

        const res = await commit(`e-s2-not-live-${status.toLowerCase()}`, ITEM.mic, 1).expect(409);

        expect(res.body.message).toMatch(new RegExp(`event that is ${status}`));
      },
    );
  });

  describe('US-31 AC-1: the commitment needs a real event, item and quantity', () => {
    // TC-S2-124 · US-31 AC-1 · setup: base-users + tc-s2-122-setup · fails if an unknown event or item returned anything but 404
    // Code: commit() answers 404 when the event or the item doesn't exist.
    it('reports an unknown event or item as not found (404)', async () => {
      await commit('no-such-event', ITEM.mic, 1).expect(404);
      await commit(EVENT.capstone, 'no-such-equipment', 1).expect(404);
    });

    // TC-S2-124 · US-31 AC-1 · setup: base-users + tc-s2-122-setup · fails if a zero, negative, fractional or non-numeric quantity were accepted
    // Code: CommitReservationDto requires a whole number greater than zero.
    it.each([0, -1, 1.5, 'two'])('rejects a quantity of %p (400)', async (quantity) => {
      await commit(EVENT.capstone, ITEM.mic, quantity).expect(400);
      expect(await prisma.equipmentReservation.count()).toBe(0);
    });
  });

  describe('access: Technical Support only', () => {
    // TC-S2-125 · US-31 · setup: base-users + tc-s2-122-setup · fails if another role could commit equipment
    // Code: the route is @Roles(TECHNICAL_SUPPORT_STAFF), so RolesGuard answers 403.
    it.each(OTHER_ROLES)('refuses %s (403) and commits nothing', async (who) => {
      await commit(EVENT.capstone, ITEM.mic, 1, who).expect(403);
      expect(await prisma.equipmentReservation.count()).toBe(0);
    });

    // TC-S2-125 · US-31 · setup: base-users + tc-s2-122-setup · fails if equipment could be committed without logging in
    // Code: JwtAuthGuard answers 401 without a token.
    it('refuses a request without a token (401)', async () => {
      await http().post('/equipment/reservations').send({ eventId: EVENT.capstone, equipmentId: ITEM.mic, quantity: 1 }).expect(401);
    });
  });

  describe('US-31 AC-2: a committed quantity is immediately locked for overlapping periods', () => {
    // TC-S2-126 · US-31 AC-2, US-29 AC-2 · setup: base-users + tc-s2-122-setup · fails if a commitment wasn't reflected straight away in the availability check
    // Code: the APPROVED row is what the availability check counts, so the next check sees it.
    it('is excluded from the very next availability check for an overlapping window', async () => {
      await commit(EVENT.capstone, ITEM.mic, 4).expect(201);

      const res = await availability(ITEM.mic, 1, '2030-10-01T16:00:00.000Z', '2030-10-01T18:00:00.000Z').expect(200);

      expect(res.body).toMatchObject({ reservedQuantity: 4, availableQuantity: 6 });
    });

    // TC-S2-126 · US-31 AC-2 · setup: base-users + tc-s2-122-setup · fails if units already committed could be committed again to an overlapping event
    // Code: commit() subtracts the peak already committed in the window before accepting.
    it('cannot be committed again to an overlapping event', async () => {
      await commit(EVENT.capstone, ITEM.mic, 7).expect(201);

      await commit(EVENT.overlapping, ITEM.mic, 4).expect(409);
      await commit(EVENT.overlapping, ITEM.mic, 3).expect(201);
    });

    // TC-S2-126 · US-31 AC-2 · setup: base-users + tc-s2-122-setup · fails if a commitment locked periods it doesn't overlap
    // Code: overlap is start < end AND end > start, so a back-to-back or next-day event is unaffected.
    it('does not lock non-overlapping periods, including back-to-back', async () => {
      await commit(EVENT.capstone, ITEM.mic, 10).expect(201);

      await commit(EVENT.backToBack, ITEM.mic, 10).expect(201);
      await commit(EVENT.nextDay, ITEM.mic, 10).expect(201);
    });

    // TC-S2-126 · US-31 AC-2 · setup: base-users + tc-s2-122-setup · fails if committing one item locked a different item
    // Code: availability is worked out per item.
    it('locks only the item committed, not other items', async () => {
      await commit(EVENT.capstone, ITEM.mic, 10).expect(201);

      await commit(EVENT.overlapping, ITEM.pa, 4).expect(201);
    });

    // TC-S2-126 · US-31 AC-2 · setup: base-users + tc-s2-122-setup · fails if an event's own earlier commitment were treated as still free
    // Code: every APPROVED reservation counts, including the same event's, since those units are physically in use.
    it("counts the same event's earlier commitment too", async () => {
      await commit(EVENT.capstone, ITEM.mic, 6).expect(201);

      await commit(EVENT.capstone, ITEM.mic, 5).expect(409);
      await commit(EVENT.capstone, ITEM.mic, 4).expect(201);
    });

    // TC-S2-127 · US-31 AC-2 · setup: base-users + tc-s2-122-setup · fails if two commitments made at the same moment could together take more than exists
    // Code: commit() locks the item's row, so the second request sees the first and gets 409.
    it('lets exactly one of two simultaneous over-committing requests through', async () => {
      // 6 + 6 > 10: without the row lock both would read 10 free and succeed.
      const results = await Promise.all([commit(EVENT.capstone, ITEM.mic, 6), commit(EVENT.overlapping, ITEM.mic, 6)]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const held = await prisma.equipmentReservation.aggregate({
        where: { equipmentId: ITEM.mic, status: ReservationStatus.APPROVED },
        _sum: { quantity: true },
      });
      expect(held._sum.quantity).toBe(6);
    });
  });

  describe('US-31 AC-3: committing a quantity already locked elsewhere is rejected, with the reason', () => {
    // TC-S2-128 · US-31 AC-3 · setup: base-users + tc-s2-122-setup · fails if an over-commitment wasn't refused, or the reason didn't state what is free and what is held
    // Code: the 409 message states free, requested and committed counts and the window.
    it('rejects one unit more than is free, stating the counts', async () => {
      await commit(EVENT.overlapping, ITEM.mic, 4).expect(201);

      const res = await commit(EVENT.capstone, ITEM.mic, 7).expect(409);

      expect(res.body.message).toBe(
        'Only 6 of the 7 Wireless microphone requested are free for ' +
          '2030-10-01T09:00:00.000Z – 2030-10-01T17:00:00.000Z: 4 of 10 are ' +
          'already committed to an overlapping period.',
      );
    });

    // TC-S2-128 · US-31 AC-3 · setup: base-users + tc-s2-122-setup · fails if exactly the free quantity were refused
    // Code: the check is requested <= free.
    it('accepts exactly the free quantity (boundary)', async () => {
      await commit(EVENT.overlapping, ITEM.mic, 4).expect(201);

      await commit(EVENT.capstone, ITEM.mic, 6).expect(201);
    });

    // TC-S2-128 · US-31 AC-3 · setup: base-users + tc-s2-122-setup · fails if equipment under maintenance could be committed, or the reason didn't say why
    // Code: an item that isn't lendable is refused with its status in the message.
    it('rejects equipment under maintenance, saying so', async () => {
      const res = await commit(EVENT.capstone, ITEM.projector, 1).expect(409);

      expect(res.body.message).toBe('Projector (4K) is under maintenance, so none of it can be committed.');
    });

    // TC-S2-128 · US-31 AC-3 · setup: base-users + tc-s2-122-setup · fails if a refused commitment still left a reservation behind
    // Code: the check runs before anything is written.
    it('creates nothing when rejected', async () => {
      await commit(EVENT.overlapping, ITEM.mic, 10).expect(201);
      await commit(EVENT.capstone, ITEM.mic, 1).expect(409);

      expect(await reservationsOf(EVENT.capstone)).toEqual([]);
    });
  });

  describe("beyond the story's ACs: the Coordinator is notified of a commitment", () => {
    // TC-S2-129 · US-31 (extra) · setup: base-users + tc-s2-122-setup · fails if the event's Coordinator wasn't told about a commitment
    // Code: after a successful commit, an EQUIPMENT_RESERVATION_DECIDED notification goes to the assigned Coordinator.
    it('records a notification for the assigned Coordinator', async () => {
      await commit(EVENT.capstone, ITEM.mic, 2).expect(201);

      const notes = await prisma.notification.findMany({ where: { recipientId: 'u-coordinator-a' } });
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({
        type: NotificationType.EQUIPMENT_RESERVATION_DECIDED,
        relatedEventId: EVENT.capstone,
        read: false,
      });
      expect(notes[0].message).toContain('2 × Wireless microphone committed to "Capstone Showcase"');
    });

    // TC-S2-129 · US-31 (extra) · setup: base-users + tc-s2-122-setup · fails if a refused commitment still notified someone
    // Code: the notification is only sent after the reservation is saved.
    it('notifies nobody when the commitment is rejected', async () => {
      await commit(EVENT.capstone, ITEM.projector, 1).expect(409);

      expect(await prisma.notification.count()).toBe(0);
    });

    // TC-S2-129 · US-31 (extra) · setup: base-users + tc-s2-122-setup + tc-s2-129-setup · fails if an event without a Coordinator couldn't have equipment committed
    // Code: with no Coordinator, commit() still saves, and skips the notification.
    it('still commits, notifying nobody, when the event has no Coordinator', async () => {
      await given('tc-s2-129-setup');

      await commit('e-s2-unassigned', ITEM.mic, 1).expect(201);
      expect(await prisma.notification.count()).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Story 32: release equipment reservations for a cancelled event
  // ---------------------------------------------------------------------------

  describe('US-32 AC-1: cancelling an event releases all of its reservations', () => {
    // TC-S2-130 · US-32 AC-1 · setup: base-users + tc-s2-122-setup · fails if any reservation of a cancelled event stayed held, or had no release time
    // Code: setStatus(CANCELLED) calls releaseForCancelledEvent() in the same transaction.
    it('marks every reservation the event held as RELEASED, with a timestamp', async () => {
      await commit(EVENT.capstone, ITEM.mic, 4).expect(201);
      await commit(EVENT.capstone, ITEM.pa, 2).expect(201);

      await cancel(EVENT.capstone);

      const rows = await reservationsOf(EVENT.capstone);
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.status).toBe(ReservationStatus.RELEASED);
        expect(row.releasedAt).toBeInstanceOf(Date);
      }
      expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: EVENT.capstone } })).status).toBe(EventStatus.CANCELLED);
    });

    // TC-S2-130 · US-32 AC-1 · setup: base-users + tc-s2-122-setup + tc-s2-130-setup · fails if a pending reservation stayed held, or a rejected one were marked released
    // Code: RELEASABLE_STATUSES is REQUESTED and APPROVED; REJECTED never held anything.
    it('releases a still-pending reservation too, leaving a rejected one alone', async () => {
      await given('tc-s2-130-setup');

      await cancel(EVENT.capstone);

      const byId = Object.fromEntries((await reservationsOf(EVENT.capstone)).map((r) => [r.id, r]));
      expect(byId['r-s2-130-pending'].status).toBe(ReservationStatus.RELEASED);
      expect(byId['r-s2-130-rejected']).toMatchObject({ status: ReservationStatus.REJECTED, releasedAt: null });
    });

    // TC-S2-131 · US-32 AC-1 · setup: base-users + tc-s2-122-setup · fails if any other status change released the reservations
    // Code: setStatus() only releases when the new status is CANCELLED.
    it('releases nothing when the event moves to any other status', async () => {
      await commit(EVENT.capstone, ITEM.mic, 4).expect(201);

      await events.setStatus(await prisma.eventRequest.findUniqueOrThrow({ where: { id: EVENT.capstone } }), EventStatus.CONFIRMED);

      expect((await reservationsOf(EVENT.capstone))[0].status).toBe(ReservationStatus.APPROVED);
    });
  });

  describe('US-32 AC-2: released equipment is available again for the same period', () => {
    // TC-S2-132 · US-32 AC-2, US-29 AC-2 · setup: base-users + tc-s2-122-setup · fails if released units still counted as reserved in the availability check
    // Code: the availability check only counts APPROVED reservations, and RELEASED isn't one.
    it('restores the units in the availability check for the same window', async () => {
      await commit(EVENT.capstone, ITEM.mic, 10).expect(201);
      expect((await availability(ITEM.mic, 10).expect(200)).body).toMatchObject({ availableQuantity: 0, fullyAvailable: false });

      await cancel(EVENT.capstone);

      expect((await availability(ITEM.mic, 10).expect(200)).body).toMatchObject({
        reservedQuantity: 0,
        availableQuantity: 10,
        fullyAvailable: true,
      });
    });

    // TC-S2-132 · US-32 AC-2, US-31 AC-2 · setup: base-users + tc-s2-122-setup · fails if released units couldn't be committed to another event
    // Code: commit() uses the same count, so the freed units can be committed again.
    it('lets the released units be committed to an overlapping event', async () => {
      await commit(EVENT.capstone, ITEM.mic, 10).expect(201);
      await commit(EVENT.overlapping, ITEM.mic, 10).expect(409);

      await cancel(EVENT.capstone);

      await commit(EVENT.overlapping, ITEM.mic, 10).expect(201);
    });
  });

  describe('US-32 AC-3: Technical Support can see what was released, for which cancelled event', () => {
    // TC-S2-133 · US-32 AC-3 · setup: base-users + tc-s2-122-setup · fails if a released reservation wasn't listed with its equipment and cancelled event, or a held one was
    // Code: the released list reads RELEASED rows with their equipment and event.
    it('lists released reservations with the equipment and the cancelled event', async () => {
      await commit(EVENT.capstone, ITEM.mic, 4).expect(201);
      await commit(EVENT.overlapping, ITEM.pa, 1).expect(201);
      await cancel(EVENT.capstone);

      const res = await released().expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        quantity: 4,
        start: START,
        end: END,
        status: 'RELEASED',
        equipment: { id: ITEM.mic, type: 'Wireless microphone' },
        event: { id: EVENT.capstone, name: 'Capstone Showcase', status: 'CANCELLED' },
      });
      expect(Number.isNaN(Date.parse(res.body[0].releasedAt))).toBe(false);
      expect(res.headers['cache-control']).toBe('no-store');
    });

    // TC-S2-133 · US-32 AC-3 · setup: base-users + tc-s2-122-setup · fails if the list showed anything when nothing had been released
    // Code: with no RELEASED rows the list is empty.
    it('is empty when nothing has been released', async () => {
      expect((await released().expect(200)).body).toEqual([]);
    });

    // TC-S2-133 · US-32 AC-3 · setup: base-users + tc-s2-122-setup · fails if another role could see the released list
    // Code: the route is @Roles(TECHNICAL_SUPPORT_STAFF).
    it.each(OTHER_ROLES)('refuses %s (403)', async (who) => {
      await released(who).expect(403);
    });
  });

  describe('US-32 AC-4: release affects only that event, and never releases twice', () => {
    // TC-S2-134 · US-32 AC-4 · setup: base-users + tc-s2-122-setup · fails if cancelling one event released another event's reservation of the same item
    // Code: releaseForCancelledEvent() filters by the cancelled event's id.
    it("leaves other events' reservations of the same item held", async () => {
      await commit(EVENT.capstone, ITEM.mic, 4).expect(201);
      await commit(EVENT.nextDay, ITEM.mic, 3).expect(201);

      await cancel(EVENT.capstone);

      expect((await reservationsOf(EVENT.nextDay))[0]).toMatchObject({ status: ReservationStatus.APPROVED, releasedAt: null });
    });

    // TC-S2-134 · US-32 AC-4 · setup: base-users + tc-s2-122-setup + tc-s2-134-setup · fails if an already-released reservation were released again, moving its release time
    // Code: RELEASED is not in RELEASABLE_STATUSES, so the row is not touched.
    it('does not re-release an already-released reservation', async () => {
      await given('tc-s2-134-setup');

      await cancel(EVENT.capstone);

      const old = await prisma.equipmentReservation.findUniqueOrThrow({ where: { id: 'r-s2-134-old' } });
      expect(old.releasedAt).toEqual(new Date('2030-01-01T00:00:00.000Z'));
    });

    // TC-S2-134 · US-32 AC-4 · setup: base-users + tc-s2-122-setup · fails if releasing the same cancelled event twice changed anything
    // Code: a second release finds nothing releasable (returns 0); CANCELLED -> CANCELLED is a no-op in setStatus().
    it('changes nothing on a second release of the same cancelled event', async () => {
      await commit(EVENT.capstone, ITEM.mic, 4).expect(201);
      await cancel(EVENT.capstone);
      const first = (await reservationsOf(EVENT.capstone))[0];

      const releasedAgain = await prisma.$transaction((tx) =>
        app.get(EquipmentReservationsService).releaseForCancelledEvent(EVENT.capstone, tx),
      );
      await cancel(EVENT.capstone);

      expect(releasedAgain).toBe(0);
      expect((await reservationsOf(EVENT.capstone))[0].releasedAt).toEqual(first.releasedAt);
    });
  });
});
