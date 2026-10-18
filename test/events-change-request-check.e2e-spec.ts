import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BookingDecisionKind,
  BookingStatus,
  ChangeRequestStatus,
  EquipmentStatus,
  EventStatus,
  NotificationType,
  PrismaClient,
  ReservationStatus,
  Role,
  VenueStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { EquipmentReservationsService } from '../src/equipment/equipment-reservations.service';
import { listenOnLoopback } from './listen-on-loopback';

/**
 * US-48 e2e — the Coordinator reviews a change request against the event's
 * venue and equipment arrangements (the review is US-38 in the code), and
 * approval rebooks them. One describe per acceptance criterion, "US-48 AC-n".
 *
 * Times are UTC. The event runs 01:00–05:00 on 1 Oct; the request moves it to
 * the same time on 2 Oct. Main Hall has the customer's buffers (30 min setup,
 * 45 min turnaround); the Annex has none.
 */
describe('US-48 check arrangements on a change request (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

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

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: key, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  const seedVenue = async (key: string, capacity: number, setup = 0, turnaround = 0) => {
    ids[key] = (
      await prisma.venue.create({
        data: {
          name: key,
          location: 'Campus',
          capacity,
          facilities: [],
          accessibilityFeatures: [],
          status: VenueStatus.PUBLISHED,
          managedById: ids.staff,
          setupMinutes: setup,
          turnaroundMinutes: turnaround,
        },
      })
    ).id;
  };

  const seedEquipment = async (
    key: string,
    total: number,
    status: EquipmentStatus = EquipmentStatus.OPERATIONAL,
  ) => {
    ids[key] = (
      await prisma.equipment.create({
        data: { type: key, totalQuantity: total, operationalStatus: status },
      })
    ).id;
  };

  const seedEvent = async (key: string, coordinator = 'coordinator') => {
    ids[key] = (
      await prisma.eventRequest.create({
        data: {
          organiserId: ids.organiser,
          coordinatorId: ids[coordinator],
          name: key,
          purpose: 'p',
          description: 'd',
          category: 'c',
          proposedStart: OLD.start,
          proposedEnd: OLD.end,
          expectedAttendance: 100,
          status: EventStatus.CONFIRMED,
        },
      })
    ).id;
  };

  /** An approved booking, with Venue Staff's decision on record. */
  const seedBooking = async (
    key: string,
    event: string,
    venue: string,
    window = OLD,
    status: BookingStatus = BookingStatus.APPROVED,
  ) => {
    const booking = await prisma.venueBooking.create({
      data: {
        eventId: ids[event],
        venueId: ids[venue],
        start: window.start,
        end: window.end,
        status,
        expectedAttendance: 100,
        requestedById: ids.coordinator,
        equipmentNeeds: 'PA',
      },
    });
    if (status === BookingStatus.APPROVED) {
      await prisma.bookingDecision.create({
        data: {
          bookingId: booking.id,
          decidedById: ids.staff,
          kind: BookingDecisionKind.DECISION,
          outcome: BookingStatus.APPROVED,
          reason: 'Confirmed.',
        },
      });
    }
    ids[key] = booking.id;
  };

  const seedReservation = async (key: string, event: string, item: string, quantity: number, window = OLD) => {
    ids[key] = (
      await prisma.equipmentReservation.create({
        data: {
          eventId: ids[event],
          equipmentId: ids[item],
          quantity,
          start: window.start,
          end: window.end,
          status: ReservationStatus.APPROVED,
        },
      })
    ).id;
  };

  const seedRequest = async (
    proposal: {
      proposedStart?: Date | null;
      proposedEnd?: Date | null;
      proposedAttendance?: number | null;
      equipment?: { item: string; quantity: number }[];
    },
    event = 'conf',
  ) => {
    const created = await prisma.eventChangeRequest.create({
      data: {
        eventId: ids[event],
        requestedById: ids.organiser,
        reason: 'The keynote speaker moved.',
        proposedStart: proposal.proposedStart === undefined ? NEW.start : proposal.proposedStart,
        proposedEnd: proposal.proposedEnd === undefined ? NEW.end : proposal.proposedEnd,
        proposedAttendance: proposal.proposedAttendance ?? null,
        equipmentChanged: proposal.equipment !== undefined,
        equipment: proposal.equipment
          ? {
              create: proposal.equipment.map((line) => ({
                equipmentId: ids[line.item],
                quantity: line.quantity,
              })),
            }
          : undefined,
      },
    });
    ids.request = created.id;
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

  const clear = async () => {
    await prisma.notification.deleteMany();
    await prisma.eventChange.deleteMany();
    await prisma.eventChangeRequest.deleteMany();
    await prisma.equipmentRequirement.deleteMany();
    await prisma.equipmentReservation.updateMany({ data: { replacedById: null } });
    await prisma.equipmentReservation.deleteMany();
    await prisma.equipment.deleteMany();
    await prisma.bookingSuggestion.deleteMany();
    await prisma.bookingDecision.deleteMany();
    await prisma.venueBooking.updateMany({ data: { replacesBookingId: null, replacedByBookingId: null } });
    await prisma.venueBooking.deleteMany();
    await prisma.venueBlock.deleteMany();
    await prisma.venue.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await listenOnLoopback(app);

    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await clear();
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    await clear();

    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);
    await seedUser('otherCoordinator', 'other@example.com', Role.EVENT_COORDINATOR);
    await seedUser('staff', 'staff@example.com', Role.VENUE_STAFF);
    await seedUser('tech', 'tech@example.com', Role.TECHNICAL_SUPPORT_STAFF);
    await seedUser('attendee', 'attendee@example.com', Role.ATTENDEE);

    await seedVenue('mainHall', 200, 30, 45);
    await seedVenue('annex', 50);
    await seedEquipment('projector', 6);
    await seedEquipment('microphone', 10);
    await seedEquipment('brokenCamera', 4, EquipmentStatus.OUT_OF_SERVICE);

    // The event: Main Hall, and 4 of the 6 projectors.
    await seedEvent('conf');
    await seedBooking('hallBooking', 'conf', 'mainHall');
    await seedReservation('projectors', 'conf', 'projector', 4);

    // Another event, for clashes.
    await seedEvent('rival', 'otherCoordinator');
  });

  describe('US-48 AC-1: opening a pending request runs the check, and changes nothing', () => {
    it('returns the check with the review, writing nothing', async () => {
      await seedRequest({});
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
    it('reports a venue still free at the new time as working', async () => {
      await seedRequest({});

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

    it('reports a clash with another event’s booking at the new time', async () => {
      await seedBooking('rivalHall', 'rival', 'mainHall', NEW);
      await seedRequest({});

      const { body } = await review().expect(200);

      expect(body.check.canApprove).toBe(false);
      expect(body.check.venueBookings[0]).toMatchObject({
        available: false,
        conflicts: [
          'mainHall is already booked for "rival" at the new time (setup and turnaround included).',
        ],
      });
    });

    it('reports a clash that exists only through setup or turnaround time', async () => {
      // The rival ends 00:30 on 2 Oct; Main Hall's 45 min turnaround runs to
      // 01:15, and the moved event's 30 min setup starts 00:30 — touching the
      // event time alone would be fine, the buffers are not.
      await seedBooking('rivalHall', 'rival', 'mainHall', {
        start: at(2, '00:00'),
        end: at(2, '00:45'),
      });
      await seedRequest({});

      const { body } = await review().expect(200);

      expect(body.check.venueBookings[0].available).toBe(false);
      expect(body.check.conflicts[0].reason).toContain('setup and turnaround included');
    });

    it('reports a venue blocked out as unavailable at the new time', async () => {
      await prisma.venueBlock.create({
        data: {
          venueId: ids.mainHall,
          start: at(2, '00:00'),
          end: at(2, '12:00'),
          reason: 'Floor resurfacing',
          createdById: ids.staff,
        },
      });
      await seedRequest({});

      const { body } = await review().expect(200);

      expect(body.check.conflicts.map((c: { reason: string }) => c.reason)).toEqual([
        'mainHall is unavailable at the new time (Floor resurfacing).',
      ]);
    });

    it('warns — and still approves — when capacity is below the new attendance', async () => {
      await seedRequest({ proposedAttendance: 250 });

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

    it('checks several venues independently', async () => {
      await seedBooking('annexBooking', 'conf', 'annex');
      await seedBooking('rivalAnnex', 'rival', 'annex', NEW);
      await seedRequest({});

      const { body } = await review().expect(200);

      const byId = Object.fromEntries(
        body.check.venueBookings.map((b: { bookingId: string; available: boolean }) => [b.bookingId, b.available]),
      );
      expect(byId).toEqual({ [ids.hallBooking]: true, [ids.annexBooking]: false });
    });
  });

  describe('US-48 AC-3: each equipment item, in the requested quantity, at the new time', () => {
    it('reports equipment that is available', async () => {
      await seedRequest({ equipment: [{ item: 'microphone', quantity: 8 }] });

      const { body } = await review().expect(200);

      expect(body.check.equipment).toEqual([
        expect.objectContaining({ equipmentType: 'microphone', quantity: 8, available: true }),
      ]);
    });

    it('reports equipment short because another event holds it', async () => {
      await seedReservation('rivalProjectors', 'rival', 'projector', 4, NEW);
      await seedRequest({});

      const { body } = await review().expect(200);

      expect(body.check.equipmentReservations[0]).toMatchObject({
        quantity: 4,
        available: false,
        reason: 'Only 2 of 4 projector free for the new time.',
      });
    });

    it('reports a non-operational item as unavailable', async () => {
      await seedRequest({ equipment: [{ item: 'brokenCamera', quantity: 1 }] });

      const { body } = await review().expect(200);

      expect(body.check.equipment[0]).toMatchObject({
        available: false,
        reason: 'brokenCamera is damaged, so none is available for the new time.',
      });
    });

    it("never counts this event's own reservation against itself", async () => {
      // The event holds 4 of 6. Counting its own 4 at the new time would leave
      // only 2 — but they are the ones moving.
      await seedRequest({ equipment: [{ item: 'projector', quantity: 6 }] });

      const { body } = await review().expect(200);

      expect(body.check.equipmentReservations[0]).toMatchObject({ quantity: 4, available: true });
      expect(body.check.equipment[0]).toMatchObject({ quantity: 6, available: true });
    });
  });

  describe('US-48 AC-4: a summary of what works and what conflicts, with reasons', () => {
    it('lists the valid and the conflicting arrangements', async () => {
      await seedBooking('annexBooking', 'conf', 'annex');
      await seedBooking('rivalAnnex', 'rival', 'annex', NEW);
      await seedRequest({ equipment: [{ item: 'microphone', quantity: 2 }] });

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
    it('rejects, changes nothing else, and tells the Organiser why', async () => {
      await seedRequest({});
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

    it('still requires a reason', async () => {
      await seedRequest({});
      await reject('').expect(400);
    });
  });

  describe('US-48 AC-6: before approving, what will be moved to the new details', () => {
    it('lists each venue booking and reservation that approval would rebook', async () => {
      await seedRequest({});

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
    it('moves everything to the new details, keeps the originals linked, and records it', async () => {
      await seedRequest({ proposedAttendance: 120 });

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

    it('frees the old time: no approved booking is left there', async () => {
      await seedRequest({});
      await approve().expect(200);

      const live = await prisma.venueBooking.count({
        where: { venueId: ids.mainHall, status: BookingStatus.APPROVED, start: OLD.start },
      });
      expect(live).toBe(0);
    });

    it('rebooks reservations even when the request does not change the equipment list', async () => {
      await seedRequest({});
      await approve().expect(200);

      expect(
        await prisma.equipmentReservation.count({
          where: { eventId: ids.conf, status: ReservationStatus.APPROVED, start: NEW.start },
        }),
      ).toBe(1);
    });

    it('an attendance-only change rebooks nothing; only the capacity warning applies', async () => {
      await seedRequest({ proposedStart: null, proposedEnd: null, proposedAttendance: 300 });

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

    it('an event with no bookings or reservations is approved without error', async () => {
      await seedEvent('bare');
      await seedRequest({}, 'bare');

      const { body } = await review().expect(200);
      expect(body.check).toMatchObject({ venueBookings: [], equipmentReservations: [], canApprove: true });

      await approve().expect(200);
      expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: ids.bare } })).proposedStart).toEqual(
        NEW.start,
      );
    });

    it('a failure halfway rolls everything back and leaves the request pending', async () => {
      await seedRequest({});
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

    it('stale page: a booking taken after the request was opened refuses the approval with 409', async () => {
      await seedRequest({});
      await review().expect(200).expect((res) => expect(res.body.check.canApprove).toBe(true));

      // Meanwhile, another event takes Main Hall at the new time.
      await seedBooking('rivalHall', 'rival', 'mainHall', NEW);
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

    it('a direct approve call with a conflict, without ever opening the request, is refused the same way', async () => {
      await seedRequest({});
      await seedReservation('rivalProjectors', 'rival', 'projector', 5, NEW);
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

    it('lists every conflict — venue and equipment together', async () => {
      await seedRequest({});
      await seedBooking('rivalHall', 'rival', 'mainHall', NEW);
      await seedReservation('rivalProjectors', 'rival', 'projector', 5, NEW);

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

    it('re-checking after the conflict clears shows it can go ahead, and approval then succeeds', async () => {
      await seedRequest({});
      await seedBooking('rivalHall', 'rival', 'mainHall', NEW);
      await approve().expect(409);

      // The rival booking is released; the Coordinator re-checks.
      await prisma.venueBooking.update({
        where: { id: ids.rivalHall },
        data: { status: BookingStatus.RELEASED },
      });
      await review().expect(200).expect((res) => expect(res.body.check.canApprove).toBe(true));

      await approve().expect(200);
      expect(await pending()).toBe(ChangeRequestStatus.APPROVED);
    });

    it('after a refused approval the Coordinator can still reject, leaving everything unchanged', async () => {
      await seedRequest({});
      await seedBooking('rivalHall', 'rival', 'mainHall', NEW);
      await approve().expect(409);
      const before = await snapshot();

      await reject('The hall is taken that day.').expect(200);

      expect(await snapshot()).toEqual(before);
      expect(await pending()).toBe(ChangeRequestStatus.REJECTED);
      expect((await notificationsTo('organiser')).map((n) => n.message)).toEqual([
        'Your change request for "conf" was rejected. Reason: The hall is taken that day.',
      ]);
    });

    it('a capacity shortfall alone never refuses the approval', async () => {
      await seedRequest({ proposedAttendance: 999 });

      await approve().expect(200);
    });
  });

  describe('US-48 AC-9: the Organiser is notified only when the Coordinator decides — and no one else', () => {
    it('on approval', async () => {
      await seedRequest({});
      await approve().expect(200);

      expect(await notificationsTo('organiser')).toEqual([
        expect.objectContaining({
          type: NotificationType.CHANGE_REQUEST_DECIDED,
          message: 'Your change request for "conf" was approved; the event has been updated.',
        }),
      ]);
      for (const who of ['staff', 'tech', 'attendee', 'coordinator']) {
        expect(await notificationsTo(who)).toEqual([]);
      }
    });

    it('not on a refused approval — nothing was decided', async () => {
      await seedRequest({});
      await seedBooking('rivalHall', 'rival', 'mainHall', NEW);
      await approve().expect(409);

      expect(await prisma.notification.count()).toBe(0);
    });
  });

  describe('US-48: only the Coordinator responsible for the event', () => {
    it('another Coordinator can neither see the check nor decide (404)', async () => {
      await seedRequest({});
      const before = await snapshot();

      await review('otherCoordinator').expect(404);
      await approve('otherCoordinator').expect(404);
      await reject('No.', 'otherCoordinator').expect(404);

      expect(await snapshot()).toEqual(before);
    });

    it.each(['organiser', 'staff', 'tech', 'attendee'])('is refused to %s (403)', async (who) => {
      await seedRequest({});

      await review(who).expect(403);
      await approve(who).expect(403);
      await reject('No.', who).expect(403);
    });
  });
});
