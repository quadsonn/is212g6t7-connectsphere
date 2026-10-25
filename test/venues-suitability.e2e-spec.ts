import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  EquipmentStatus,
  EventStatus,
  Facility,
  PrismaClient,
  ReservationStatus,
} from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * Story 19 — suitability flags for one venue against one of
 * my events, before I submit a booking request. Integration tests, one
 * describe per AC.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql and tc-s2-28-setup.sql (the venue and a
 * fitting event); some tests then load a further tc-s2 script, as their test
 * case names (docs/testing/sprint2-test-cases.md).
 */
describe('Story 19 venue suitability flags (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';

  /** Fixed users from base-users.sql. */
  const USERS = {
    coordinator: 'coord.a@example.com',
    staff: 'venue.staff@example.com',
    organiser: 'organiser@example.com',
  } as const;
  const tokens: Record<string, string> = {};

  /** Fixed rows from tc-s2-28/29/31/33-setup.sql. */
  const VENUE = { hall: 'VEN-035', draft: 'VEN-034' } as const;
  const EVENT = {
    fits: 'EVT-076',
    oneOver: 'EVT-092',
    misfit: 'EVT-091',
    theirs: 'EVT-126',
    pool: 'EVT-106',
  } as const;
  const INACTIVE: Record<string, string> = {
    [EventStatus.REJECTED]: 'EVT-113',
    [EventStatus.CANCELLED]: 'EVT-059',
    [EventStatus.COMPLETED]: 'EVT-061',
  };

  const as = (who: keyof typeof USERS) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const suitability = (venueId: string, eventId: string, who: keyof typeof USERS = 'coordinator') =>
    http()
      .get(`/venues/${venueId}/suitability`)
      .query({ eventId })
      .set('Authorization', as(who));

  /** Loads a test case's setup script(s) on top of base-users and tc-s2-28. */
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
    await given('base-users', 'tc-s2-28-setup');
  });

  describe('AC-1/AC-2/AC-4: per-requirement flags and an overall indicator', () => {
    // TC-S2-28 · setup: base-users + tc-s2-28-setup · fails if a fitting venue showed no indicator, or not every check
    it('US-19: reports a suitable venue as positively SUITABLE, with each check shown', async () => {
      const res = await suitability(VENUE.hall, EVENT.fits).expect(200);

      expect(res.body).toMatchObject({
        overall: 'SUITABLE',
        overallSuitable: true,
        capacity: { status: 'MET', venueCapacity: 100, expectedAttendance: 80 },
        accessibility: {
          status: 'MET',
          items: [{ requirement: 'STEP_FREE_ACCESS', met: true }],
        },
        layout: { status: 'MET', requirement: 'THEATRE' },
      });
    });

    // TC-S2-29 · setup: base-users + tc-s2-28-setup + tc-s2-29-setup · fails if being one over capacity passed, or accessibility gaps were lumped into one warning
    it('US-19: flags capacity and each missing accessibility requirement individually', async () => {
      await given('tc-s2-29-setup');

      const res = await suitability(VENUE.hall, EVENT.oneOver).expect(200);

      expect(res.body.overall).toBe('NOT_SUITABLE');
      expect(res.body.capacity.status).toBe('UNMET');
      expect(res.body.accessibility.items).toEqual([
        { requirement: 'STEP_FREE_ACCESS', met: true },
        { requirement: 'HEARING_LOOP', met: false },
      ]);
    });
  });

  // The AC-3 tests have no test case ID yet (none in docs/testing for them).
  // Each sets the facilities and equipment it needs here, on top of
  // tc-s2-28-setup's Hall (VEN-035) and fitting event (EVT-076).
  describe('AC-3: facilities cover the technical requirements', () => {
    const venueHas = (facilities: Facility[]) =>
      prisma.venue.update({ where: { id: VENUE.hall }, data: { facilities } });
    const eventNeeds = (requiredFacilities: Facility[]) =>
      prisma.eventRequest.update({ where: { id: EVENT.fits }, data: { requiredFacilities } });

    // No TC ID yet · setup: base-users + tc-s2-28-setup + facilities · fails if met facilities were not flagged one by one
    it('US-19: Given the venue has every required facility, Then facilities are met', async () => {
      await venueHas([Facility.PROJECTOR, Facility.MICROPHONE]);
      await eventNeeds([Facility.PROJECTOR, Facility.MICROPHONE]);

      const res = await suitability(VENUE.hall, EVENT.fits).expect(200);

      expect(res.body.overall).toBe('SUITABLE');
      expect(res.body.facilities).toEqual({
        status: 'MET',
        items: [
          { requirement: 'PROJECTOR', met: true },
          { requirement: 'MICROPHONE', met: true },
        ],
      });
    });

    // No TC ID yet · setup: base-users + tc-s2-28-setup + facilities · fails if a missing facility passed or went unnamed
    it('US-19: Given a required facility the venue lacks, Then it is flagged and the venue may not be suitable', async () => {
      await venueHas([Facility.PROJECTOR, Facility.MICROPHONE]);
      await eventNeeds([Facility.PROJECTOR, Facility.STAGE]);

      const res = await suitability(VENUE.hall, EVENT.fits).expect(200);

      expect(res.body.overall).toBe('NOT_SUITABLE');
      expect(res.body.facilities.status).toBe('UNMET');
      expect(res.body.facilities.items).toContainEqual({ requirement: 'STAGE', met: false });
    });

    // No TC ID yet · setup: base-users + tc-s2-28-setup · fails if "nothing required" were reported as unchecked or unmet
    it('US-19: Given no required facilities, Then nothing is required and nothing is reported unchecked', async () => {
      const res = await suitability(VENUE.hall, EVENT.fits).expect(200);

      expect(res.body.facilities).toEqual({ status: 'NOT_REQUIRED', items: [] });
      expect(res.body.equipment).toEqual({ status: 'NOT_REQUIRED', items: [] });
      expect(res.body.notChecked).toEqual([]);
    });
  });

  describe('AC-3: the equipment asked for is available over the event dates', () => {
    /** Another event on the same day (10 Mar 2027), to hold units against. */
    const seedOtherEvent = () =>
      prisma.eventRequest.create({
        data: {
          organiserId: 'USR-006',
          coordinatorId: 'USR-004',
          name: 'Other',
          purpose: 'Purpose',
          description: 'Description',
          category: 'Talk',
          proposedStart: new Date('2027-03-10T01:00:00Z'),
          proposedEnd: new Date('2027-03-10T09:00:00Z'),
          expectedAttendance: 40,
          status: EventStatus.APPROVED,
        },
      });

    const seedEquipment = (
      totalQuantity: number,
      operationalStatus: EquipmentStatus = EquipmentStatus.OPERATIONAL,
    ) => prisma.equipment.create({ data: { type: 'Wireless mic', totalQuantity, operationalStatus } });

    const requires = (equipmentType: string, quantity: number, equipmentId: string | null = null) =>
      prisma.equipmentRequirement.create({
        data: { eventId: EVENT.fits, equipmentType, quantity, equipmentId },
      });

    const reserve = (
      eventId: string,
      equipmentId: string,
      quantity: number,
      status: ReservationStatus = ReservationStatus.APPROVED,
    ) =>
      prisma.equipmentReservation.create({
        data: {
          eventId,
          equipmentId,
          quantity,
          // Overlaps EVT-076's 01:00–09:00 UTC.
          start: new Date('2027-03-10T05:00:00Z'),
          end: new Date('2027-03-10T12:00:00Z'),
          status,
        },
      });

    // No TC ID yet · setup: base-users + tc-s2-28-setup + equipment · fails if free units were miscounted
    it('US-19: Given enough free units, Then equipment is met, with the free count', async () => {
      const mic = await seedEquipment(6);
      await requires('Wireless mic', 4, mic.id);

      const res = await suitability(VENUE.hall, EVENT.fits).expect(200);

      expect(res.body.equipment).toEqual({
        status: 'MET',
        items: [{ item: 'Wireless mic', requestedQuantity: 4, availableQuantity: 6, available: true }],
      });
    });

    // No TC ID yet · setup: base-users + tc-s2-28-setup + equipment + another event · fails if another event's reservation were ignored
    it("US-19: Given another event's approved reservation leaves too few units, Then equipment is unmet", async () => {
      const other = await seedOtherEvent();
      const mic = await seedEquipment(6);
      await requires('Wireless mic', 4, mic.id);
      await reserve(other.id, mic.id, 3);

      const res = await suitability(VENUE.hall, EVENT.fits).expect(200);

      expect(res.body.equipment.status).toBe('UNMET');
      expect(res.body.equipment.items[0]).toMatchObject({ availableQuantity: 3, available: false });
      // Equipment is the same at every venue, so the venue verdict stands.
      expect(res.body.overall).toBe('SUITABLE');
    });

    // No TC ID yet · setup: base-users + tc-s2-28-setup + equipment · fails if an event's own reservation counted against it
    it("US-19: Given the event's own approved reservation, Then its units are not counted against it", async () => {
      const mic = await seedEquipment(6);
      await requires('Wireless mic', 4, mic.id);
      await reserve(EVENT.fits, mic.id, 4);

      const res = await suitability(VENUE.hall, EVENT.fits).expect(200);

      expect(res.body.equipment.items[0]).toMatchObject({ availableQuantity: 6, available: true });
    });

    // No TC ID yet · setup: base-users + tc-s2-28-setup + equipment + another event · fails if a pending reservation held units
    it('US-19: Given a pending reservation elsewhere, Then it holds no units', async () => {
      const other = await seedOtherEvent();
      const mic = await seedEquipment(6);
      await requires('Wireless mic', 4, mic.id);
      await reserve(other.id, mic.id, 6, ReservationStatus.REQUESTED);

      const res = await suitability(VENUE.hall, EVENT.fits).expect(200);

      expect(res.body.equipment.items[0].available).toBe(true);
    });

    // No TC ID yet · setup: base-users + tc-s2-28-setup + equipment · fails if an item under maintenance counted as available
    it('US-19: Given an item under maintenance, Then none of its units are available', async () => {
      const mic = await seedEquipment(6, EquipmentStatus.UNDER_MAINTENANCE);
      await requires('Wireless mic', 1, mic.id);

      const res = await suitability(VENUE.hall, EVENT.fits).expect(200);

      expect(res.body.equipment.items[0]).toMatchObject({ availableQuantity: 0, available: false });
    });

    // No TC ID yet · setup: base-users + tc-s2-28-setup + a free-text line · fails if an uncheckable line read as a pass
    it('US-19: Given a free-text line, Then it is listed as not checked, never as a pass', async () => {
      await requires('Fog machine', 1);

      const res = await suitability(VENUE.hall, EVENT.fits).expect(200);

      expect(res.body.equipment).toEqual({
        status: 'NOT_RECORDED',
        items: [{ item: 'Fog machine', requestedQuantity: 1, availableQuantity: null, available: null }],
      });
      expect(res.body.notChecked).toEqual([
        { check: 'equipment', reason: expect.stringMatching(/not linked to the catalogue/) },
      ]);
    });

    // No TC ID yet · setup: base-users + tc-s2-28-setup + equipment · fails if checking reserved equipment
    it('US-19: reserves nothing while checking', async () => {
      const mic = await seedEquipment(6);
      await requires('Wireless mic', 4, mic.id);

      await suitability(VENUE.hall, EVENT.fits).expect(200);

      expect(await prisma.equipmentReservation.count()).toBe(0);
    });
  });

  describe('AC-5: advisory only', () => {
    // TC-S2-31 · setup: base-users + tc-s2-28-setup + tc-s2-31-setup · fails if running the check created or changed anything
    it('US-19: changes nothing — no booking, reservation, notification or event edit', async () => {
      await given('tc-s2-31-setup');
      const before = await prisma.eventRequest.findUniqueOrThrow({ where: { id: EVENT.misfit } });

      await suitability(VENUE.hall, EVENT.misfit).expect(200);

      expect(await prisma.venueBooking.count()).toBe(0);
      expect(await prisma.equipmentReservation.count()).toBe(0);
      expect(await prisma.notification.count()).toBe(0);
      const after = await prisma.eventRequest.findUniqueOrThrow({ where: { id: EVENT.misfit } });
      expect(after.updatedAt).toEqual(before.updatedAt);
      expect(after.status).toBe(before.status);
    });

    // TC-S2-31 · setup: base-users + tc-s2-28-setup + tc-s2-31-setup · fails if a NOT_SUITABLE flag blocked the booking request
    it('US-19 AC-5: a booking request still submits after suitability reports flags', async () => {
      // Flags are advice, not a gate: the Coordinator may know something the
      // system doesn't. Submits through Story 20. The flag here is accessibility:
      // capacity is the exception, refused outright (CAPACITY_EXCEEDED).
      await given('tc-s2-31-setup');

      const check = await suitability(VENUE.hall, EVENT.misfit).expect(200);
      expect(check.body.overall).toBe('NOT_SUITABLE');

      const submitted = await http()
        .post('/bookings')
        .set('Authorization', as('coordinator'))
        .send({
          eventId: EVENT.misfit,
          venueId: VENUE.hall,
          start: '2027-03-10T01:00:00.000Z',
          end: '2027-03-10T09:00:00.000Z',
          expectedAttendance: 80,
        })
        .expect(201);

      expect(submitted.body.status).toBe('REQUESTED');
    });
  });

  describe('AC-6: a single-venue check, fast', () => {
    // TC-S2-32 · setup: base-users + tc-s2-28-setup · fails if the check took 2 seconds or more
    it('US-19: answers within two seconds', async () => {
      const started = Date.now();
      await suitability(VENUE.hall, EVENT.fits).expect(200);

      expect(Date.now() - started).toBeLessThan(2000);
    });
  });

  describe('access: my assigned, active events only', () => {
    // TC-S2-33 · setup: base-users + tc-s2-28-setup + tc-s2-33-setup · fails if a Coordinator could check another Coordinator's event
    it("US-19: hides another Coordinator's event as not found", async () => {
      await given('tc-s2-33-setup');

      await suitability(VENUE.hall, EVENT.theirs).expect(404);
    });

    // TC-S2-33 · setup: base-users + tc-s2-28-setup + tc-s2-33-setup · fails if an unassigned event in the review pool could be checked
    it('US-19: hides an unassigned event from the review pool', async () => {
      await given('tc-s2-33-setup');

      await suitability(VENUE.hall, EVENT.pool).expect(404);
    });

    // TC-S2-33 · setup: base-users + tc-s2-28-setup + tc-s2-33-setup · fails if a finished or cancelled event could still be checked
    it.each([EventStatus.REJECTED, EventStatus.CANCELLED, EventStatus.COMPLETED])(
      'US-19: hides a %s event as not found',
      async (status) => {
        await given('tc-s2-33-setup');

        await suitability(VENUE.hall, INACTIVE[status]).expect(404);
      },
    );

    // TC-S2-33 · setup: base-users + tc-s2-28-setup · fails if a draft venue could be checked
    it('US-19: reports a draft venue as not found', async () => {
      await suitability(VENUE.draft, EVENT.fits).expect(404);
    });

    // TC-S2-33 · setup: base-users + tc-s2-28-setup · fails if the check ran without saying which event
    it('US-19: requires an eventId', async () => {
      await http()
        .get(`/venues/${VENUE.hall}/suitability`)
        .set('Authorization', as('coordinator'))
        .expect(400);
    });

    // TC-S2-33 · setup: base-users + tc-s2-28-setup · fails if a role other than Coordinator could run the check
    it.each(['staff', 'organiser'] as const)('US-19: refuses %s with 403', async (who) => {
      await suitability(VENUE.hall, EVENT.fits, who).expect(403);
    });
  });
});
