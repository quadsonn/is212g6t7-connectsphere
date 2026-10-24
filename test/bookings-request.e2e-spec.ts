import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AccessibilityFeature, BookingStatus, Facility, PrismaClient, RoomLayout } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * Story 20 — a Coordinator submits a request to book a venue
 * with timing and requirements. Integration tests, one describe per AC.
 *
 * Pre-condition for every test: reset the testDB, then run
 * test/fixtures/sql/base-users.sql, base-venues.sql and tc-s2-34-setup.sql
 * (an approved event with its requirements); some tests then load a further
 * tc-s2 script, as their test case names (docs/testing/sprint2-test-cases.md).
 */
describe('Story 20 submit a venue booking request (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';

  /** Fixed users: base-users.sql, plus USR-011 from tc-s2-01-setup.sql. */
  const USERS = {
    coordinator: 'coord.a@example.com',
    otherCoordinator: 'coord.b@example.com',
    organiser: 'organiser@example.com',
    staff: 'venue.staff@example.com',
    staffB: 'venue.staff.b@example.com',
  } as const;
  const tokens: Record<string, string> = {};

  /** Fixed rows from base-venues.sql and tc-s2-34/36/38/40-setup.sql. */
  const VENUE = 'VEN-002';
  const EVENT = { orientation: 'EVT-102', notApproved: 'EVT-095' } as const;

  const as = (who: keyof typeof USERS) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const book = (body: Record<string, unknown>, who: keyof typeof USERS = 'coordinator') =>
    http().post('/bookings').set('Authorization', as(who)).send(body);

  /** A slot on 1 October 2030 (UTC). */
  const slot = (startHour: number, endHour: number) => ({
    start: `2030-10-01T${String(startHour).padStart(2, '0')}:00:00.000Z`,
    end: `2030-10-01T${String(endHour).padStart(2, '0')}:00:00.000Z`,
  });

  /** The complete, valid request: Main Hall for Orientation, 09:00–12:00. */
  const validRequest = { eventId: EVENT.orientation, venueId: VENUE, ...slot(9, 12), expectedAttendance: 120 };

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
    await given('base-users', 'tc-s2-01-setup');
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
    await given('base-users', 'base-venues', 'tc-s2-34-setup');
  });

  describe('AC-1: date, times and attendance are required', () => {
    // TC-S2-34 · setup: base-users + base-venues + tc-s2-34-setup · fails if a request without date, times or attendance were accepted, or the fields weren't each named
    it('rejects a request missing them, flagging each field', async () => {
      const res = await book({ eventId: EVENT.orientation, venueId: VENUE }).expect(400);

      expect(res.body.message).toEqual(
        expect.arrayContaining([
          'start must be a valid ISO 8601 date',
          'end must be a valid ISO 8601 date',
          'expectedAttendance must be a whole number',
        ]),
      );
    });

    // TC-S2-34 · setup: base-users + base-venues + tc-s2-34-setup · fails if an invalid value got past the API (the form's checks can be bypassed)
    it.each([
      ['a start in the past', { start: '2020-01-01T09:00:00.000Z', end: '2020-01-01T12:00:00.000Z' }, 'start must be in the future'],
      ['an end before the start', { start: '2030-10-01T12:00:00.000Z', end: '2030-10-01T09:00:00.000Z' }, 'end must be later than start'],
      ['zero attendance', { expectedAttendance: 0 }, 'expectedAttendance must be greater than zero'],
      ['fractional attendance', { expectedAttendance: 12.5 }, 'expectedAttendance must be a whole number'],
    ])('refuses %s (400) and creates nothing', async (_case, override, message) => {
      const res = await book({ ...validRequest, ...override }).expect(400);

      expect(res.body.message).toContain(message);
      expect(await prisma.venueBooking.count()).toBe(0);
    });
  });

  describe('AC-2/AC-3: requirements attached, status pending', () => {
    // TC-S2-35 · setup: base-users + base-venues + tc-s2-34-setup · fails if the event's requirements weren't attached, or the request were created as anything but pending
    it('creates a REQUESTED booking carrying the event requirements', async () => {
      const res = await book(validRequest).expect(201);

      expect(res.body).toMatchObject({
        status: BookingStatus.REQUESTED,
        expectedAttendance: 120,
        preferredLayout: RoomLayout.THEATRE,
        accessibilityRequirements: [AccessibilityFeature.HEARING_LOOP],
        accessibilityNotes: 'Two hearing aid users',
        equipmentNeeds: '2 wireless mics',
        venue: { id: VENUE, name: 'Main Hall' },
        event: { id: EVENT.orientation, name: 'Orientation' },
        warnings: [],
      });
    });

    // These tests have no test case ID yet (none in docs/testing for them).
    // Each adds the equipment lines, technical support and facilities it needs
    // to tc-s2-34-setup's Orientation event (EVT-102).
    describe('Story 20 AC-2: the technical requirements travel with the request', () => {
      const withTechnicalRequirements = async () => {
        await prisma.eventRequest.update({
          where: { id: EVENT.orientation },
          data: {
            requiredFacilities: [Facility.PROJECTOR, Facility.STAGE],
            technicalSupportNeeds: 'A technician on site for sound checks',
          },
        });
        const projector = await prisma.equipment.create({ data: { type: 'Projector', totalQuantity: 4 } });
        // Created in order, so the copy keeps the order they were entered in.
        await prisma.equipmentRequirement.create({
          data: { eventId: EVENT.orientation, equipmentId: projector.id, equipmentType: 'Projector', quantity: 2, notes: 'HDMI' },
        });
        await prisma.equipmentRequirement.create({
          data: { eventId: EVENT.orientation, equipmentType: 'Fog machine', quantity: 1 },
        });
      };

      // No TC ID yet · setup: base-users + base-venues + tc-s2-34-setup + technical requirements · fails if any of them were left off the request
      it('Given equipment lines, technical support and facilities, When submitted, Then all are attached', async () => {
        await withTechnicalRequirements();

        const res = await book(validRequest).expect(201);

        expect(res.body).toMatchObject({
          requiredFacilities: ['PROJECTOR', 'STAGE'],
          technicalSupportNeeds: 'A technician on site for sound checks',
          equipmentRequirements: [
            { equipmentType: 'Projector', quantity: 2, notes: 'HDMI' },
            { equipmentType: 'Fog machine', quantity: 1, notes: null },
          ],
          // The free-text notes are still attached alongside.
          equipmentNeeds: '2 wireless mics',
        });
      });

      // No TC ID yet · setup: base-users + base-venues + tc-s2-34-setup + technical requirements · fails if Venue Staff had to open the event to see them
      it('Given the venue manager opens the request, Then they see them without opening the event', async () => {
        await withTechnicalRequirements();
        const created = await book(validRequest).expect(201);

        const res = await http().get(`/bookings/${created.body.id}`).set('Authorization', as('staff')).expect(200);

        expect(res.body.equipmentRequirements).toHaveLength(2);
        expect(res.body.technicalSupportNeeds).toBe('A technician on site for sound checks');
        expect(res.body.requiredFacilities).toEqual(['PROJECTOR', 'STAGE']);
      });

      // No TC ID yet · setup: base-users + base-venues + tc-s2-34-setup + technical requirements · fails if a later event edit rewrote a submitted request
      it('Given the event changes after submission, Then the request keeps what was submitted', async () => {
        await withTechnicalRequirements();
        const created = await book(validRequest).expect(201);

        await prisma.equipmentRequirement.deleteMany({ where: { eventId: EVENT.orientation } });
        await prisma.eventRequest.update({
          where: { id: EVENT.orientation },
          data: { technicalSupportNeeds: null, requiredFacilities: [] },
        });

        const res = await http().get(`/bookings/${created.body.id}`).set('Authorization', as('staff')).expect(200);
        expect(res.body.equipmentRequirements).toHaveLength(2);
        expect(res.body.technicalSupportNeeds).toBe('A technician on site for sound checks');
        expect(res.body.requiredFacilities).toEqual(['PROJECTOR', 'STAGE']);
      });

      // No TC ID yet · setup: base-users + base-venues + tc-s2-34-setup · fails if "none recorded" looked like "not recorded"
      it('Given none recorded, Then the request carries an empty list, not "not recorded"', async () => {
        const res = await book(validRequest).expect(201);

        expect(res.body).toMatchObject({
          equipmentRequirements: [],
          technicalSupportNeeds: null,
          requiredFacilities: [],
        });
      });

      // No TC ID yet · setup: base-users + base-venues + tc-s2-34-setup + an older request · fails if an older request seemed to have none
      it('Given a request made before these were attached, Then its list reads as not recorded (null)', async () => {
        const old = await prisma.venueBooking.create({
          data: {
            eventId: EVENT.orientation,
            venueId: VENUE,
            start: new Date(slot(9, 12).start),
            end: new Date(slot(9, 12).end),
          },
        });

        const res = await http().get(`/bookings/${old.id}`).set('Authorization', as('staff')).expect(200);

        expect(res.body.equipmentRequirements).toBeNull();
      });
    });
  });

  // Sprint 3 (capacity validation, added with US-41/47/48/50/52/53): not a
  // Story 20 acceptance criterion, so these have no TC-S2 number yet.
  describe('Capacity AC-1/AC-2: a venue too small for the expected attendance cannot be requested', () => {
    // Sprint 3 capacity · setup: base-users + base-venues + tc-s2-34-setup · fails if a request over the venue's capacity were accepted, or the reason not given
    // Code: createRequest() runs capacityShortfall() (venues/capacity.ts) on the
    // request's attendance; 499 > Main Hall's 300, so it answers 409
    // CAPACITY_EXCEEDED before anything is saved.
    it('Capacity AC-1/AC-2: refuses 499 attendees for Main Hall, which holds 300 (409), saying why, and creates nothing', async () => {
      const res = await book({ ...validRequest, expectedAttendance: 499 }).expect(409);

      expect(res.body).toMatchObject({
        code: 'CAPACITY_EXCEEDED',
        message: 'Main Hall holds 300, but expected attendance is 499.',
        capacity: 300,
        expectedAttendance: 499,
      });
      expect(await prisma.venueBooking.count()).toBe(0);
    });

    // Sprint 3 capacity · setup: base-users + base-venues + tc-s2-34-setup · fails if a request that fits the venue were refused
    // Code: exceedsCapacity() is attendance > capacity, so equal attendance fits.
    it.each([
      ['equal to', 300],
      ['below', 120],
    ])('Capacity AC-1: allows attendance %s capacity (%i)', async (_label, attendance) => {
      const res = await book({ ...validRequest, expectedAttendance: attendance }).expect(201);

      expect(res.body.status).toBe(BookingStatus.REQUESTED);
    });
  });

  describe('AC-4: overlapping a confirmed booking is blocked', () => {
    // TC-S2-36 · setup: base-users + base-venues + tc-s2-34-setup + tc-s2-36-setup · fails if a doomed request overlapping a confirmed booking were accepted, or the clash weren't named
    it('returns 409 naming the conflicting booking, and creates nothing', async () => {
      await given('tc-s2-36-setup');

      const res = await book(validRequest).expect(409);

      expect(res.body.conflicts).toEqual([
        expect.objectContaining({ bookingId: 'BKG-028', eventName: 'Hackathon' }),
      ]);
      expect(await prisma.venueBooking.count({ where: { eventId: EVENT.orientation } })).toBe(0);
    });

    // TC-S2-37 · setup: base-users + base-venues + tc-s2-34-setup + tc-s2-37-setup · fails if a slot merely touching a confirmed booking were treated as a clash
    it('allows a back-to-back slot that only touches the confirmed one', async () => {
      await given('tc-s2-37-setup');

      await book(validRequest).expect(201);
    });
  });

  describe('AC-5: overlapping only a pending request is allowed with a warning', () => {
    // TC-S2-38 · setup: base-users + base-venues + tc-s2-34-setup + tc-s2-38-setup · fails if a pending overlap blocked submission, or passed without a warning
    it('creates the request and warns about the pending one', async () => {
      await given('tc-s2-38-setup');

      const res = await book(validRequest).expect(201);

      expect(res.body.warnings).toEqual([
        expect.objectContaining({
          code: 'OVERLAPS_PENDING_REQUEST',
          conflicts: [expect.objectContaining({ bookingId: 'BKG-030' })],
        }),
      ]);
    });

    // TC-S2-38 · setup: base-users + base-venues + tc-s2-34-setup + tc-s2-38-setup · fails if the warning didn't say which request (event and times) it clashes with
    it('names the conflicting request by event and time range', async () => {
      await given('tc-s2-38-setup');

      const res = await book(validRequest).expect(201);

      expect(res.body.warnings[0].conflicts[0]).toMatchObject({
        eventName: 'Hackathon',
        start: slot(10, 14).start,
        end: slot(10, 14).end,
      });
    });
  });

  describe("AC-6: the request appears in the Coordinator's history", () => {
    // TC-S2-39 · setup: base-users + base-venues + tc-s2-34-setup · fails if a submitted request were missing from my history, or showed in another Coordinator's
    it('lists it under GET /bookings/mine for the requester only', async () => {
      const created = await book(validRequest).expect(201);

      const mine = await http().get('/bookings/mine').set('Authorization', as('coordinator')).expect(200);
      const theirs = await http().get('/bookings/mine').set('Authorization', as('otherCoordinator')).expect(200);

      expect(mine.body.map((b: { id: string }) => b.id)).toEqual([created.body.id]);
      expect(theirs.body).toEqual([]);
    });
  });

  describe('access', () => {
    // TC-S2-40 · setup: base-users + base-venues + tc-s2-34-setup · fails if an Organiser could submit a venue booking request
    it('denies an Organiser (403)', async () => {
      await book(validRequest, 'organiser').expect(403);
    });

    // TC-S2-40 · setup: base-users + base-venues + tc-s2-34-setup · fails if a Coordinator could book for an event assigned to someone else
    it('hides an event assigned to another Coordinator (404)', async () => {
      await book(validRequest, 'otherCoordinator').expect(404);
    });

    // TC-S2-40 · setup: base-users + base-venues + tc-s2-34-setup + tc-s2-40-setup · fails if a venue could be requested before the event was approved
    it('refuses an event that has not been approved yet (409)', async () => {
      await given('tc-s2-40-setup');

      await book({ ...validRequest, eventId: EVENT.notApproved }).expect(409);
    });

    // TC-S2-40 · setup: base-users + base-venues + tc-s2-01-setup + tc-s2-34-setup · fails if the request's details were visible to anyone outside the requester, Organiser and venue manager
    it("shows full detail to the requester, the event's Organiser and the venue's manager only", async () => {
      await given('tc-s2-01-setup');
      const created = await book(validRequest).expect(201);
      const get = (who: keyof typeof USERS) =>
        http().get(`/bookings/${created.body.id}`).set('Authorization', as(who));

      const requester = await get('coordinator').expect(200);
      expect(requester.body).toMatchObject({
        id: created.body.id,
        equipmentNeeds: '2 wireless mics',
        event: { organiser: { id: 'USR-006' } },
      });

      await get('staff').expect(200);
      await get('organiser').expect(200);
      await get('staffB').expect(404);
      await get('otherCoordinator').expect(404);
    });
  });
});
