import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus, ChangeRequestStatus, NotificationType, PrismaClient, ReservationStatus } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { EquipmentReservationsService } from '../src/equipment/equipment-reservations.service';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-48 e2e — the Coordinator reviews a change request against the event's
 * venue and equipment arrangements (the review is US-38 in the code), and
 * approval rebooks them. One describe per acceptance criterion, "US-48 AC-n".
 *
 * Times are UTC. The event runs 01:00–05:00 on 1 Oct; the request moves it to
 * the same time on 2 Oct. Main Hall has the customer's buffers (30 min setup,
 * 45 min turnaround); the Annex has none.
 *
 * Pre-condition for every test: reset the testDB, then run base-users.sql and
 * tc-s3-113-setup.sql ("conf" EVT-249 with Main Hall and 4 projectors; "rival"
 * EVT-250). Each test loads its change request's script (tc-s3-113b … 120) and
 * any clash script (see docs/testing/sprint3-test-cases.md, TC-S3-113 to 123).
 */
describe('US-48 check arrangements on a change request (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  /** Fixed rows from base-users and the tc-s3-113 scripts. */
  const ids: Record<string, string> = {
    organiser: 'USR-006',
    coordinator: 'USR-004',
    otherCoordinator: 'USR-005',
    staff: 'USR-010',
    tech: 'USR-009',
    attendee: 'USR-001',
    mainHall: 'VEN-063',
    annex: 'VEN-064',
    projector: 'EQP-019',
    microphone: 'EQP-020',
    brokenCamera: 'EQP-021',
    conf: 'EVT-249',
    rival: 'EVT-250',
    bare: 'EVT-251',
    hallBooking: 'BKG-114',
    projectors: 'RSV-031',
    rivalHall: 'BKG-115',
    annexBooking: 'BKG-117',
  };
  const LOGINS: Record<string, string> = {
    organiser: 'organiser@example.com',
    coordinator: 'coord.a@example.com',
    otherCoordinator: 'coord.b@example.com',
    staff: 'venue.staff@example.com',
    tech: 'tech.support@example.com',
    attendee: 'attendee@example.com',
  };

  const at = (day: number, hhmm: string) => new Date(`2030-10-0${day}T${hhmm}:00.000Z`);
  const OLD = { start: at(1, '01:00'), end: at(1, '05:00') };
  const NEW = { start: at(2, '01:00'), end: at(2, '05:00') };

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const review = (who = 'coordinator', id = ids.request) =>
    http().get(`/events/change-requests/${id}`).set('Authorization', as(who));
  const approve = (who = 'coordinator', id = ids.request) =>
    http().post(`/events/change-requests/${id}/approve`).set('Authorization', as(who));
  const reject = (reason: string, who = 'coordinator', id = ids.request) =>
    http()
      .post(`/events/change-requests/${id}/reject`)
      .set('Authorization', as(who))
      .send({ reason });

  /** Loads a test case's setup script(s) on top of the base scripts. */
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  /** The pending change request a test reviews: its script and its ID. */
  const seedRequest = async (script: string, id: string) => {
    await given(script);
    ids.request = id;
  };

  /** Everything this story could touch, to prove something did not change. */
  const snapshot = async () => ({
    event: await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.conf } }),
    bookings: await prisma.venueBooking.findMany({ orderBy: { id: 'asc' } }),
    reservations: await prisma.equipmentReservation.findMany({ orderBy: { id: 'asc' } }),
    requirements: await prisma.equipmentRequirement.findMany({ orderBy: { id: 'asc' } }),
    history: await prisma.eventChange.count(),
  });

  const notificationsTo = (who: string) =>
    prisma.notification.findMany({ where: { recipientId: ids[who] } });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');

    prisma = new PrismaClient();

    // Users keep their fixed IDs after every reset, so these tokens stay valid.
    await resetDb(prisma);
    await loadSql(prisma, 'base-users');
    for (const [key, email] of Object.entries(LOGINS)) {
      const res = await http().post('/auth/login').send({ email, password: PASSWORD }).expect(200);
      tokens[key] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    await resetDb(prisma);
    await loadSql(prisma, 'base-users');
    await loadSql(prisma, 'tc-s3-113-setup');
  });

  describe('US-48 AC-1: opening a pending request runs the check, and changes nothing', () => {
    // TC-S3-113 · US-48 AC-1 · setup: base-users + tc-s3-113-setup + tc-s3-113b-setup · fails if opening a pending request does not run the check, or changes something
    // Code: EventsChangeReviewService.review -> change-arrangement-check (read only)
    it('returns the check with the review, writing nothing', async () => {
      await seedRequest('tc-s3-113b-setup', 'CRQ-008');
      const before = await snapshot();

      const res = await review().expect(200);

      expect(res.body.check).toMatchObject({ canApprove: true, newWindow: { start: NEW.start.toISOString() } });
      expect(await snapshot()).toEqual(before);
      expect(
        (await prisma.eventChangeRequest.findUniqueOrThrow({ where: { id: ids.request } })).status,
      ).toBe(ChangeRequestStatus.PENDING);
      expect(await prisma.notification.count()).toBe(0);
    });
  });

  describe('US-48 AC-2: each booked venue — still free at the new time, and big enough', () => {
    // TC-S3-114 · US-48 AC-2 · setup: base-users + tc-s3-113-setup + tc-s3-113b-setup · fails if a venue clash at the new time (including buffers or a block) is missed, or a capacity shortfall blocks approval
    // Code: change-arrangement-check venue rules (conflictsFor with buffers, capacity warning)
    it('reports a venue still free at the new time as working', async () => {
      await seedRequest('tc-s3-113b-setup', 'CRQ-008');

      const { body } = await review().expect(200);

      expect(body.check.venueBookings).toEqual([
        expect.objectContaining({
          bookingId: ids.hallBooking,
          moves: true,
          available: true,
          conflicts: [],
          proposed: { start: NEW.start.toISOString(), end: NEW.end.toISOString() },
        }),
      ]);
    });

    // TC-S3-114 · US-48 AC-2 · setup: base-users + tc-s3-113-setup + tc-s3-114-setup + tc-s3-113b-setup · fails if a venue clash at the new time (including buffers or a block) is missed, or a capacity shortfall blocks approval
    // Code: change-arrangement-check venue rules (conflictsFor with buffers, capacity warning)
    it('reports a clash with another event’s booking at the new time', async () => {
      await given('tc-s3-114-setup'); // rival takes mainHall at the new time
      await seedRequest('tc-s3-113b-setup', 'CRQ-008');

      const { body } = await review().expect(200);

      expect(body.check.canApprove).toBe(false);
      expect(body.check.venueBookings[0]).toMatchObject({
        available: false,
        conflicts: [
          'mainHall is already booked for "rival" at the new time (setup and turnaround included).',
        ],
      });
    });

    // TC-S3-114 · US-48 AC-2 · setup: base-users + tc-s3-113-setup + tc-s3-114c-setup + tc-s3-113b-setup · fails if a venue clash at the new time (including buffers or a block) is missed, or a capacity shortfall blocks approval
    // Code: change-arrangement-check venue rules (conflictsFor with buffers, capacity warning)
    it('reports a clash that exists only through setup or turnaround time', async () => {
      // The rival ends 00:30 on 2 Oct; Main Hall's 45 min turnaround runs to
      // 01:15, and the moved event's 30 min setup starts 00:30 — touching the
      // event time alone would be fine, the buffers are not.
      await given('tc-s3-114c-setup'); // rival: mainHall 2 Oct 00:00-00:45
      await seedRequest('tc-s3-113b-setup', 'CRQ-008');

      const { body } = await review().expect(200);

      expect(body.check.venueBookings[0].available).toBe(false);
      expect(body.check.conflicts[0].reason).toContain('setup and turnaround included');
    });

    // TC-S3-114 · US-48 AC-2 · setup: base-users + tc-s3-113-setup + tc-s3-114d-setup + tc-s3-113b-setup · fails if a venue clash at the new time (including buffers or a block) is missed, or a capacity shortfall blocks approval
    // Code: change-arrangement-check venue rules (conflictsFor with buffers, capacity warning)
    it('reports a venue blocked out as unavailable at the new time', async () => {
      await given('tc-s3-114d-setup'); // mainHall blocked 2 Oct 00:00-12:00
      await seedRequest('tc-s3-113b-setup', 'CRQ-008');

      const { body } = await review().expect(200);

      expect(body.check.conflicts.map((c: { reason: string }) => c.reason)).toEqual([
        'mainHall is unavailable at the new time (Floor resurfacing).',
      ]);
    });

    // TC-S3-114 · US-48 AC-2 · setup: base-users + tc-s3-113-setup + tc-s3-114b-setup · fails if a venue clash at the new time (including buffers or a block) is missed, or a capacity shortfall blocks approval
    // Code: change-arrangement-check venue rules (conflictsFor with buffers, capacity warning)
    it('warns — and still approves — when capacity is below the new attendance', async () => {
      await seedRequest('tc-s3-114b-setup', 'CRQ-009'); // 250 attending

      const { body } = await review().expect(200);
      expect(body.check.canApprove).toBe(true);
      expect(body.warnings).toEqual([
        expect.objectContaining({
          type: 'CAPACITY_EXCEEDED',
          capacity: 200,
          proposedAttendance: 250,
          message: 'The proposed attendance of 250 exceeds the capacity of mainHall (200).',
        }),
      ]);
      expect(body.check.venueBookings[0].capacityWarning).toBe(body.warnings[0].message);

      await approve().expect(200);
      expect(
        (await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.conf } })).expectedAttendance,
      ).toBe(250);
    });

    // TC-S3-114 · US-48 AC-2 · setup: base-users + tc-s3-113-setup + tc-s3-114e-setup + tc-s3-113b-setup · fails if a venue clash at the new time (including buffers or a block) is missed, or a capacity shortfall blocks approval
    // Code: change-arrangement-check venue rules (conflictsFor with buffers, capacity warning)
    it('checks several venues independently', async () => {
      await given('tc-s3-114e-setup'); // conf also has annex; rival has it at the new time
      await seedRequest('tc-s3-113b-setup', 'CRQ-008');

      const { body } = await review().expect(200);

      const byId = Object.fromEntries(
        body.check.venueBookings.map((b: { bookingId: string; available: boolean }) => [b.bookingId, b.available]),
      );
      expect(byId).toEqual({ [ids.hallBooking]: true, [ids.annexBooking]: false });
    });
  });

  describe('US-48 AC-3: each equipment item, in the requested quantity, at the new time', () => {
    // TC-S3-115 · US-48 AC-3 · setup: base-users + tc-s3-113-setup + tc-s3-115-setup · fails if an equipment shortfall at the new time is missed, or the event's own reservation counts against it
    // Code: change-arrangement-check equipment rules
    it('reports equipment that is available', async () => {
      await seedRequest('tc-s3-115-setup', 'CRQ-010'); // + 8 microphones

      const { body } = await review().expect(200);

      expect(body.check.equipment).toEqual([
        expect.objectContaining({ equipmentType: 'microphone', quantity: 8, available: true }),
      ]);
    });

    // TC-S3-115 · US-48 AC-3 · setup: base-users + tc-s3-113-setup + tc-s3-115d-setup + tc-s3-113b-setup · fails if an equipment shortfall at the new time is missed, or the event's own reservation counts against it
    // Code: change-arrangement-check equipment rules
    it('reports equipment short because another event holds it', async () => {
      await given('tc-s3-115d-setup'); // rival holds 4 projectors at the new time
      await seedRequest('tc-s3-113b-setup', 'CRQ-008');

      const { body } = await review().expect(200);

      expect(body.check.equipmentReservations[0]).toMatchObject({
        quantity: 4,
        available: false,
        reason: 'Only 2 of 4 projector free for the new time.',
      });
    });

    // TC-S3-115 · US-48 AC-3 · setup: base-users + tc-s3-113-setup + tc-s3-115b-setup · fails if an equipment shortfall at the new time is missed, or the event's own reservation counts against it
    // Code: change-arrangement-check equipment rules
    it('reports a non-operational item as unavailable', async () => {
      await seedRequest('tc-s3-115b-setup', 'CRQ-011'); // + 1 brokenCamera

      const { body } = await review().expect(200);

      expect(body.check.equipment[0]).toMatchObject({
        available: false,
        reason: 'brokenCamera is damaged, so none is available for the new time.',
      });
    });

    // TC-S3-115 · US-48 AC-3 · setup: base-users + tc-s3-113-setup + tc-s3-115c-setup · fails if an equipment shortfall at the new time is missed, or the event's own reservation counts against it
    // Code: change-arrangement-check equipment rules
    it("never counts this event's own reservation against itself", async () => {
      // The event holds 4 of 6. Counting its own 4 at the new time would leave
      // only 2 — but they are the ones moving.
      await seedRequest('tc-s3-115c-setup', 'CRQ-012'); // 6 projectors

      const { body } = await review().expect(200);

      expect(body.check.equipmentReservations[0]).toMatchObject({ quantity: 4, available: true });
      expect(body.check.equipment[0]).toMatchObject({ quantity: 6, available: true });
    });
  });

  describe('US-48 AC-4: a summary of what works and what conflicts, with reasons', () => {
    // TC-S3-116 · US-48 AC-4 · setup: base-users + tc-s3-113-setup + tc-s3-114e-setup + tc-s3-116-setup · fails if the summary does not split what works from what conflicts, with reasons
    // Code: change-arrangement-check works/conflicts
    it('lists the valid and the conflicting arrangements', async () => {
      await given('tc-s3-114e-setup'); // conf also has annex; rival has it at the new time
      await seedRequest('tc-s3-116-setup', 'CRQ-013'); // + 2 microphones

      const { body } = await review().expect(200);

      expect(body.check.works.map((w: { label: string }) => w.label)).toEqual([
        'Venue booking at mainHall',
        '4 × projector reservation',
        '2 × microphone',
      ]);
      expect(body.check.conflicts).toEqual([
        {
          kind: 'VENUE_BOOKING',
          label: 'Venue booking at annex',
          reason: 'annex is already booked for "rival" at the new time (setup and turnaround included).',
        },
      ]);
    });
  });

  describe('US-48 AC-5: reject with a reason — the event and its bookings stay as they were', () => {
    // TC-S3-117 · US-48 AC-5 · setup: base-users + tc-s3-113-setup + tc-s3-113b-setup · fails if a rejection changes the event or its bookings, or has no reason
    // Code: EventsChangeReviewService.reject
    it('rejects, changes nothing else, and tells the Organiser why', async () => {
      await seedRequest('tc-s3-113b-setup', 'CRQ-008');
      const before = await snapshot();

      const res = await reject('The hall is not free that day.').expect(200);

      expect(res.body).toMatchObject({ status: 'REJECTED', decisionReason: 'The hall is not free that day.' });
      expect(await snapshot()).toEqual(before);
      const [notice] = await notificationsTo('organiser');
      expect(notice).toMatchObject({
        type: NotificationType.CHANGE_REQUEST_DECIDED,
        relatedEventId: ids.conf,
        message: 'Your change request for "conf" was rejected. Reason: The hall is not free that day.',
      });
    });

    // TC-S3-117 · US-48 AC-5 · setup: base-users + tc-s3-113-setup + tc-s3-113b-setup · fails if a rejection changes the event or its bookings, or has no reason
    // Code: EventsChangeReviewService.reject
    it('still requires a reason', async () => {
      await seedRequest('tc-s3-113b-setup', 'CRQ-008');
      await reject('').expect(400);
    });
  });

  describe('US-48 AC-6: before approving, what will be moved to the new details', () => {
    // TC-S3-118 · US-48 AC-6 · setup: base-users + tc-s3-113-setup + tc-s3-113b-setup · fails if the review does not show what approval would move
    // Code: change-arrangement-check venueBookings/equipmentReservations
    it('lists each venue booking and reservation that approval would rebook', async () => {
      await seedRequest('tc-s3-113b-setup', 'CRQ-008');

      const { body } = await review().expect(200);

      expect(body.check.venueBookings).toEqual([
        expect.objectContaining({
          venueName: 'mainHall',
          moves: true,
          current: { start: OLD.start.toISOString(), end: OLD.end.toISOString() },
          proposed: { start: NEW.start.toISOString(), end: NEW.end.toISOString() },
        }),
      ]);
      expect(body.check.equipmentReservations).toEqual([
        expect.objectContaining({
          equipmentType: 'projector',
          reservationIds: [ids.projectors],
          current: { start: OLD.start.toISOString(), end: OLD.end.toISOString() },
          proposed: { start: NEW.start.toISOString(), end: NEW.end.toISOString() },
        }),
      ]);
    });
  });

  describe('US-48 AC-7: approval re-checks, updates the event, rebooks and releases, all or nothing', () => {
    // TC-S3-119 · US-48 AC-7 · setup: base-users + tc-s3-113-setup + tc-s3-119-setup · fails if approval does not move everything to the new details, or a failure halfway leaves a partial change
    // Code: EventsChangeReviewService.approve (one transaction: re-check, update, rebook, release, recordChange)
    it('moves everything to the new details, keeps the originals linked, and records it', async () => {
      await seedRequest('tc-s3-119-setup', 'CRQ-014'); // 120 attending

      const res = await approve().expect(200);

      // The event.
      const event = await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.conf } });
      expect(event).toMatchObject({ proposedStart: NEW.start, proposedEnd: NEW.end, expectedAttendance: 120, status: 'CONFIRMED' });

      // The venue booking: a new one, still approved, its decision carried over.
      const original = await prisma.venueBooking.findUniqueOrThrow({ where: { id: ids.hallBooking } });
      expect(original.status).toBe(BookingStatus.RELEASED);
      expect(original.releasedAt).not.toBeNull();
      expect(original.start).toEqual(OLD.start); // the record is kept as it was
      const moved = await prisma.venueBooking.findUniqueOrThrow({
        where: { id: original.replacedByBookingId! },
        include: { decisions: true },
      });
      expect(moved).toMatchObject({
        venueId: ids.mainHall,
        status: BookingStatus.APPROVED,
        start: NEW.start,
        end: NEW.end,
        expectedAttendance: 120,
        equipmentNeeds: 'PA',
      });
      expect(moved.decisions).toEqual([
        expect.objectContaining({ decidedById: ids.staff, outcome: BookingStatus.APPROVED }),
      ]);

      // The equipment: a new reservation, still committed; the original released.
      const oldReservation = await prisma.equipmentReservation.findUniqueOrThrow({ where: { id: ids.projectors } });
      expect(oldReservation.status).toBe(ReservationStatus.RELEASED);
      const newReservation = await prisma.equipmentReservation.findUniqueOrThrow({
        where: { id: oldReservation.replacedById! },
      });
      expect(newReservation).toMatchObject({
        equipmentId: ids.projector,
        quantity: 4,
        status: ReservationStatus.APPROVED,
        start: NEW.start,
        end: NEW.end,
      });

      // The response and the history.
      expect(res.body.arrangements.venueBookings).toEqual([
        expect.objectContaining({ bookingId: ids.hallBooking, replacementId: moved.id }),
      ]);
      const [change] = await prisma.eventChange.findMany({ where: { eventId: ids.conf } });
      const fields = (change.changes as { field: string }[]).map((c) => c.field);
      expect(fields).toEqual(
        expect.arrayContaining(['proposedStart', 'proposedEnd', 'expectedAttendance', 'venueBookings', 'equipmentReservations']),
      );
      expect(change.changedById).toBe(ids.coordinator);
    });

    // TC-S3-119 · US-48 AC-7 · setup: base-users + tc-s3-113-setup + tc-s3-113b-setup · fails if approval does not move everything to the new details, or a failure halfway leaves a partial change
    // Code: EventsChangeReviewService.approve (one transaction: re-check, update, rebook, release, recordChange)
    it('frees the old time: no approved booking is left there', async () => {
      await seedRequest('tc-s3-113b-setup', 'CRQ-008');
      await approve().expect(200);

      const live = await prisma.venueBooking.count({
        where: { venueId: ids.mainHall, status: BookingStatus.APPROVED, start: OLD.start },
      });
      expect(live).toBe(0);
    });

    // TC-S3-119 · US-48 AC-7 · setup: base-users + tc-s3-113-setup + tc-s3-113b-setup · fails if approval does not move everything to the new details, or a failure halfway leaves a partial change
    // Code: EventsChangeReviewService.approve (one transaction: re-check, update, rebook, release, recordChange)
    it('rebooks reservations even when the request does not change the equipment list', async () => {
      await seedRequest('tc-s3-113b-setup', 'CRQ-008');
      await approve().expect(200);

      expect(
        await prisma.equipmentReservation.count({
          where: { eventId: ids.conf, status: ReservationStatus.APPROVED, start: NEW.start },
        }),
      ).toBe(1);
    });

    // TC-S3-119 · US-48 AC-7 · setup: base-users + tc-s3-113-setup + tc-s3-119b-setup · fails if approval does not move everything to the new details, or a failure halfway leaves a partial change
    // Code: EventsChangeReviewService.approve (one transaction: re-check, update, rebook, release, recordChange)
    it('an attendance-only change rebooks nothing; only the capacity warning applies', async () => {
      await seedRequest('tc-s3-119b-setup', 'CRQ-015'); // attendance only, 300

      const { body } = await review().expect(200);
      expect(body.check).toMatchObject({ newWindow: null, equipmentReservations: [], canApprove: true });
      expect(body.check.venueBookings[0]).toMatchObject({ moves: false });
      expect(body.warnings).toHaveLength(1);

      await approve().expect(200);
      expect((await prisma.venueBooking.findUniqueOrThrow({ where: { id: ids.hallBooking } })).status).toBe(
        BookingStatus.APPROVED,
      );
      expect(await prisma.venueBooking.count()).toBe(1);
      expect(await prisma.equipmentReservation.count()).toBe(1);
    });

    // TC-S3-119 · US-48 AC-7 · setup: base-users + tc-s3-113-setup + tc-s3-119c-setup · fails if approval does not move everything to the new details, or a failure halfway leaves a partial change
    // Code: EventsChangeReviewService.approve (one transaction: re-check, update, rebook, release, recordChange)
    it('an event with no bookings or reservations is approved without error', async () => {
      await seedRequest('tc-s3-119c-setup', 'CRQ-016'); // "bare": nothing booked

      const { body } = await review().expect(200);
      expect(body.check).toMatchObject({ venueBookings: [], equipmentReservations: [], canApprove: true });

      await approve().expect(200);
      expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.bare } })).proposedStart).toEqual(
        NEW.start,
      );
    });

    // TC-S3-119 · US-48 AC-7 · setup: base-users + tc-s3-113-setup + tc-s3-113b-setup · fails if approval does not move everything to the new details, or a failure halfway leaves a partial change
    // Code: EventsChangeReviewService.approve (one transaction: re-check, update, rebook, release, recordChange)
    it('a failure halfway rolls everything back and leaves the request pending', async () => {
      await seedRequest('tc-s3-113b-setup', 'CRQ-008');
      const before = await snapshot();
      jest
        .spyOn(app.get(EquipmentReservationsService), 'rebookForEventChange')
        .mockRejectedValueOnce(new Error('connection lost'));

      await approve().expect(500);

      // The venue rebook had already run inside the transaction: it is undone.
      expect(await snapshot()).toEqual(before);
      expect(
        (await prisma.eventChangeRequest.findUniqueOrThrow({ where: { id: ids.request } })).status,
      ).toBe(ChangeRequestStatus.PENDING);
    });
  });

  // US-48 AC-8 (revised): a check failing at approval refuses it — 409, nothing
  // changed, the request left PENDING. It is no longer rejected automatically.
  describe('US-48 AC-8: if the check fails at approval, nothing changes and the request stays pending', () => {
    const pending = async () =>
      (await prisma.eventChangeRequest.findUniqueOrThrow({ where: { id: ids.request } })).status;

    // TC-S3-120, TC-S3-122 · US-48 AC-8/AC-10 · setup: base-users + tc-s3-113-setup + tc-s3-113b-setup + tc-s3-114-setup · fails if an approval with a conflict changes anything, leaves the request decided, or hides a conflict
    // Code: EventsChangeReviewService.approve -> 409 CHANGE_REQUEST_CHECK_FAILED
    it('stale page: a booking taken after the request was opened refuses the approval with 409', async () => {
      await seedRequest('tc-s3-113b-setup', 'CRQ-008');
      await review().expect(200).expect((res) => expect(res.body.check.canApprove).toBe(true));

      // Meanwhile, another event takes Main Hall at the new time.
      await given('tc-s3-114-setup'); // rival takes mainHall at the new time
      const before = await snapshot();

      const res = await approve().expect(409);

      expect(res.body).toEqual({
        statusCode: 409,
        error: 'Conflict',
        code: 'CHANGE_REQUEST_CHECK_FAILED',
        message:
          'Cannot approve: the arrangements no longer fit the requested details, so nothing was changed and the request is still pending. mainHall is already booked for "rival" at the new time (setup and turnaround included).',
        conflicts: [
          {
            kind: 'VENUE_BOOKING',
            label: 'Venue booking at mainHall',
            reason: 'mainHall is already booked for "rival" at the new time (setup and turnaround included).',
          },
        ],
      });
      expect(await snapshot()).toEqual(before);
      const stored = await prisma.eventChangeRequest.findUniqueOrThrow({ where: { id: ids.request } });
      expect(stored).toMatchObject({
        status: ChangeRequestStatus.PENDING,
        decidedById: null,
        decidedAt: null,
        decisionReason: null,
      });
    });

    // TC-S3-120, TC-S3-122 · US-48 AC-8/AC-10 · setup: base-users + tc-s3-113-setup + tc-s3-113b-setup + tc-s3-120b-setup · fails if an approval with a conflict changes anything, leaves the request decided, or hides a conflict
    // Code: EventsChangeReviewService.approve -> 409 CHANGE_REQUEST_CHECK_FAILED
    it('a direct approve call with a conflict, without ever opening the request, is refused the same way', async () => {
      await seedRequest('tc-s3-113b-setup', 'CRQ-008');
      await given('tc-s3-120b-setup'); // rival holds 5 projectors at the new time
      const before = await snapshot();

      const res = await approve().expect(409);

      expect(res.body.code).toBe('CHANGE_REQUEST_CHECK_FAILED');
      expect(res.body.conflicts).toEqual([
        expect.objectContaining({
          kind: 'EQUIPMENT_RESERVATION',
          reason: 'Only 1 of 4 projector free for the new time.',
        }),
      ]);
      expect(await snapshot()).toEqual(before);
      expect(await pending()).toBe(ChangeRequestStatus.PENDING);
    });

    // TC-S3-120, TC-S3-122 · US-48 AC-8/AC-10 · setup: base-users + tc-s3-113-setup + tc-s3-113b-setup + tc-s3-114-setup + tc-s3-120b-setup · fails if an approval with a conflict changes anything, leaves the request decided, or hides a conflict
    // Code: EventsChangeReviewService.approve -> 409 CHANGE_REQUEST_CHECK_FAILED
    it('lists every conflict — venue and equipment together', async () => {
      await seedRequest('tc-s3-113b-setup', 'CRQ-008');
      await given('tc-s3-114-setup'); // rival takes mainHall at the new time
      await given('tc-s3-120b-setup'); // rival holds 5 projectors at the new time

      const { body } = await review().expect(200);
      expect(body.check.canApprove).toBe(false);
      expect(body.check.conflicts.map((c: { kind: string }) => c.kind)).toEqual([
        'VENUE_BOOKING',
        'EQUIPMENT_RESERVATION',
      ]);

      const res = await approve().expect(409);
      expect(res.body.conflicts).toHaveLength(2);
      expect(await pending()).toBe(ChangeRequestStatus.PENDING);
    });

    // TC-S3-120, TC-S3-121 · US-48 AC-8/AC-9 · setup: base-users + tc-s3-113-setup + tc-s3-113b-setup + tc-s3-114-setup + tc-s3-120c-setup · fails if a re-check does not see that the conflict has cleared
    // Code: EventsChangeReviewService.review re-runs the check
    it('re-checking after the conflict clears shows it can go ahead, and approval then succeeds', async () => {
      await seedRequest('tc-s3-113b-setup', 'CRQ-008');
      await given('tc-s3-114-setup'); // rival takes mainHall at the new time
      await approve().expect(409);

      // The rival booking is released; the Coordinator re-checks.
      await given('tc-s3-120c-setup'); // rival's mainHall booking released
      await review().expect(200).expect((res) => expect(res.body.check.canApprove).toBe(true));

      await approve().expect(200);
      expect(await pending()).toBe(ChangeRequestStatus.APPROVED);
    });

    // TC-S3-120, TC-S3-122 · US-48 AC-8/AC-10 · setup: base-users + tc-s3-113-setup + tc-s3-113b-setup + tc-s3-114-setup · fails if an approval with a conflict changes anything, leaves the request decided, or hides a conflict
    // Code: EventsChangeReviewService.approve -> 409 CHANGE_REQUEST_CHECK_FAILED
    it('after a refused approval the Coordinator can still reject, leaving everything unchanged', async () => {
      await seedRequest('tc-s3-113b-setup', 'CRQ-008');
      await given('tc-s3-114-setup'); // rival takes mainHall at the new time
      await approve().expect(409);
      const before = await snapshot();

      await reject('The hall is taken that day.').expect(200);

      expect(await snapshot()).toEqual(before);
      expect(await pending()).toBe(ChangeRequestStatus.REJECTED);
      expect((await notificationsTo('organiser')).map((n) => n.message)).toEqual([
        'Your change request for "conf" was rejected. Reason: The hall is taken that day.',
      ]);
    });

    // TC-S3-120, TC-S3-122 · US-48 AC-8/AC-10 · setup: base-users + tc-s3-113-setup + tc-s3-120-setup · fails if an approval with a conflict changes anything, leaves the request decided, or hides a conflict
    // Code: EventsChangeReviewService.approve -> 409 CHANGE_REQUEST_CHECK_FAILED
    it('a capacity shortfall alone never refuses the approval', async () => {
      await seedRequest('tc-s3-120-setup', 'CRQ-017'); // 999 attending

      await approve().expect(200);
    });
  });

  describe('US-48 AC-9: the Organiser is notified only when the Coordinator decides — and no one else', () => {
    // TC-S3-123 · US-48 AC-11 · setup: base-users + tc-s3-113-setup + tc-s3-113b-setup · fails if the Organiser is not told the outcome, or someone else is
    // Code: EventsChangeReviewService -> CHANGE_REQUEST_DECIDED notice
    it('on approval', async () => {
      await seedRequest('tc-s3-113b-setup', 'CRQ-008');
      await approve().expect(200);

      expect(await notificationsTo('organiser')).toEqual([
        expect.objectContaining({
          type: NotificationType.CHANGE_REQUEST_DECIDED,
          message: 'Your change request for "conf" was approved; the event has been updated.',
        }),
      ]);
      // AC-9's decision notice goes to the Organiser alone.
      for (const who of ['staff', 'tech', 'attendee', 'coordinator']) {
        expect(
          (await notificationsTo(who)).filter((n) => n.type === NotificationType.CHANGE_REQUEST_DECIDED),
        ).toEqual([]);
      }
      // US-40 AC-1, a separate notice: the venue's manager is told once that
      // the approved booking moved, naming the new booking that kept the approval.
      expect(await notificationsTo('staff')).toEqual([
        expect.objectContaining({
          type: NotificationType.BOOKING_DETAILS_CHANGED,
          message: expect.stringContaining('The approval carries over; no new decision is needed.'),
        }),
      ]);
      expect(await notificationsTo('tech')).toEqual([]);
      expect(await notificationsTo('attendee')).toEqual([]);
      expect(await notificationsTo('coordinator')).toEqual([]);
    });

    // TC-S3-123 · US-48 AC-11 · setup: base-users + tc-s3-113-setup + tc-s3-113b-setup + tc-s3-114-setup · fails if the Organiser is not told the outcome, or someone else is
    // Code: EventsChangeReviewService -> CHANGE_REQUEST_DECIDED notice
    it('not on a refused approval — nothing was decided', async () => {
      await seedRequest('tc-s3-113b-setup', 'CRQ-008');
      await given('tc-s3-114-setup'); // rival takes mainHall at the new time
      await approve().expect(409);

      expect(await prisma.notification.count()).toBe(0);
    });
  });

  describe('US-48: only the Coordinator responsible for the event', () => {
    // TC-S3-113 · US-48 AC-1 · setup: base-users + tc-s3-113-setup + tc-s3-113b-setup · fails if another Coordinator or another role can see or decide the request
    // Code: EventsChangeReviewService.load -> AccessControlService (404) ; @Roles(EVENT_COORDINATOR)
    it('another Coordinator can neither see the check nor decide (404)', async () => {
      await seedRequest('tc-s3-113b-setup', 'CRQ-008');
      const before = await snapshot();

      await review('otherCoordinator').expect(404);
      await approve('otherCoordinator').expect(404);
      await reject('No.', 'otherCoordinator').expect(404);

      expect(await snapshot()).toEqual(before);
    });

    // TC-S3-113 · US-48 AC-1 · setup: base-users + tc-s3-113-setup + tc-s3-113b-setup · fails if another Coordinator or another role can see or decide the request
    // Code: EventsChangeReviewService.load -> AccessControlService (404) ; @Roles(EVENT_COORDINATOR)
    it.each(['organiser', 'staff', 'tech', 'attendee'])('is refused to %s (403)', async (who) => {
      await seedRequest('tc-s3-113b-setup', 'CRQ-008');

      await review(who).expect(403);
      await approve(who).expect(403);
      await reject('No.', who).expect(403);
    });
  });
});
