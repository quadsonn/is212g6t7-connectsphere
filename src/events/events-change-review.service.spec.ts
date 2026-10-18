import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  BookingStatus,
  ChangeRequestStatus,
  EquipmentStatus,
  EventStatus,
  Prisma,
  ReservationStatus,
  Role,
} from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { BookingsService } from '../bookings/bookings.service';
import { EquipmentReservationsService } from '../equipment/equipment-reservations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeArrangementCheckService } from './change-arrangement-check.service';
import { EventsChangeReviewService } from './events-change-review.service';
import { EventsService } from './events.service';
import { VenueActivityNotifier } from '../bookings/venue-activity-notifier';

/** US-38 — a Coordinator reviews a change request and approves or rejects it. */
describe('EventsChangeReviewService (US-38)', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const inDays = (days: number, hour = 9) => {
    const date = new Date(Date.now() + days * DAY);
    date.setUTCHours(hour, 0, 0, 0);
    return date;
  };

  const coordinator: AuthenticatedUser = {
    userId: 'coordinator-1',
    role: Role.EVENT_COORDINATOR,
    jti: 'j1',
  };

  const eventStart = inDays(30, 9);
  const eventEnd = inDays(30, 17);

  const event = (overrides: Record<string, unknown> = {}) => ({
    id: 'event-1',
    name: 'Hackathon',
    organiserId: 'organiser-1',
    coordinatorId: 'coordinator-1',
    status: EventStatus.PLANNING,
    proposedStart: eventStart,
    proposedEnd: eventEnd,
    expectedAttendance: 50,
    ...overrides,
  });

  const cameraLine = {
    id: 'l1',
    equipmentId: 'camera',
    quantity: 3,
    equipment: { id: 'camera', type: 'Camera' },
  };

  const request = (overrides: Record<string, unknown> = {}) => ({
    id: 'cr-1',
    eventId: 'event-1',
    status: ChangeRequestStatus.PENDING,
    reason: 'More people are coming',
    proposedStart: null,
    proposedEnd: null,
    proposedAttendance: 99,
    equipmentChanged: false,
    equipment: [],
    requestedBy: { id: 'organiser-1', name: 'Olive', email: 'o@x.test' },
    createdAt: new Date(),
    ...overrides,
  });

  type Requirement = {
    id: string;
    equipmentId: string | null;
    equipmentType: string;
    quantity: number;
    notes: string | null;
  };

  let prisma: {
    eventChangeRequest: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      updateMany: jest.Mock;
    };
    equipmentRequirement: { findMany: jest.Mock; deleteMany: jest.Mock; createMany: jest.Mock };
    eventRequest: { findUniqueOrThrow: jest.Mock; update: jest.Mock };
    venueBooking: { findMany: jest.Mock };
    venueBlock: { findMany: jest.Mock };
    equipmentReservation: { findMany: jest.Mock };
    equipment: { findUniqueOrThrow: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let access: {
    requireScope: jest.Mock;
    assertEventAccess: jest.Mock;
    isAssignedCoordinator: jest.Mock;
  };
  let events: { recordChange: jest.Mock; confirmedArrangements: jest.Mock };
  let bookings: {
    rebookForEventChange: jest.Mock;
    conflictsFor: jest.Mock;
    lockVenue: jest.Mock;
  };
  let reservations: { rebookForEventChange: jest.Mock; lockEquipment: jest.Mock };
  let notifications: { notifySafely: jest.Mock };
  let service: EventsChangeReviewService;
  // US-40: tells a venue's manager when an approved booking changes.
  let venueActivity: { approvedBookingChanged: jest.Mock };
  let stored: ReturnType<typeof request>;
  let currentEvent: ReturnType<typeof event>;
  let requirements: Requirement[];

  beforeEach(() => {
    stored = request();
    currentEvent = event();
    requirements = [];

    prisma = {
      eventChangeRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(stored)),
        findUniqueOrThrow: jest.fn().mockImplementation(() => Promise.resolve(stored)),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      equipmentRequirement: {
        findMany: jest.fn().mockImplementation(() => Promise.resolve([...requirements])),
        deleteMany: jest.fn().mockImplementation(() => {
          requirements = requirements.filter((row) => row.equipmentId === null);
          return Promise.resolve({});
        }),
        createMany: jest.fn().mockImplementation(({ data }) => {
          requirements = [
            ...requirements,
            ...data.map((row: Omit<Requirement, 'id'>, i: number) => ({ ...row, id: `new-${i}` })),
          ];
          return Promise.resolve({});
        }),
      },
      eventRequest: {
        findUniqueOrThrow: jest.fn().mockImplementation(() => Promise.resolve(currentEvent)),
        update: jest.fn().mockResolvedValue({}),
      },
      venueBooking: { findMany: jest.fn().mockResolvedValue([]) },
      venueBlock: { findMany: jest.fn().mockResolvedValue([]) },
      equipmentReservation: { findMany: jest.fn().mockResolvedValue([]) },
      // US-48 AC-3: an item on the proposed list, operational and plentiful.
      equipment: {
        findUniqueOrThrow: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve({
            id: where.id,
            type: where.id,
            totalQuantity: 100,
            operationalStatus: EquipmentStatus.OPERATIONAL,
          }),
        ),
      },
      // US-48 AC-7: the approval's row lock on the event.
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'event-1' }]),
      $transaction: jest.fn((cb) => cb(prisma)),
    };
    access = {
      requireScope: jest.fn(),
      assertEventAccess: jest.fn().mockImplementation(() => Promise.resolve(currentEvent)),
      isAssignedCoordinator: jest.fn().mockReturnValue(true),
    };
    events = {
      recordChange: jest.fn().mockResolvedValue({ id: 'change-1' }),
      confirmedArrangements: jest.fn().mockResolvedValue([]),
    };
    bookings = {
      rebookForEventChange: jest.fn().mockResolvedValue([]),
      // US-50: clashes at the new time come from the shared, buffer-aware check.
      conflictsFor: jest.fn().mockResolvedValue({
        hardConflicts: [],
        softConflicts: [],
        blocks: [],
        hasHardConflict: false,
      }),
      lockVenue: jest.fn().mockResolvedValue(undefined),
    };
    reservations = {
      rebookForEventChange: jest.fn().mockResolvedValue([]),
      lockEquipment: jest.fn().mockResolvedValue(undefined),
    };
    notifications = { notifySafely: jest.fn().mockResolvedValue(undefined) };
    venueActivity = { approvedBookingChanged: jest.fn().mockResolvedValue(undefined) };
    service = new EventsChangeReviewService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      events as unknown as EventsService,
      bookings as unknown as BookingsService,
      reservations as unknown as EquipmentReservationsService,
      // US-48: the real check, over the same mocks.
      new ChangeArrangementCheckService(bookings as unknown as BookingsService),
      notifications as unknown as NotificationsService,
      venueActivity as unknown as VenueActivityNotifier,
    );
  });

  const recorded = () => events.recordChange.mock.calls[0];

  describe('AC-1: pending requests for events assigned to this Coordinator only', () => {
    it('lists PENDING requests on events whose coordinator is the caller', async () => {
      await service.listPending(coordinator);

      expect(access.requireScope).toHaveBeenCalledWith(coordinator, Resource.EVENT, Action.REVIEW);
      expect(prisma.eventChangeRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: ChangeRequestStatus.PENDING,
            event: { coordinatorId: 'coordinator-1' },
          },
        }),
      );
    });

    it('reports a request on an event assigned to someone else as not found', async () => {
      access.isAssignedCoordinator.mockReturnValue(false);

      await expect(service.getForReview(coordinator, 'cr-1')).rejects.toThrow(NotFoundException);
      await expect(service.approve(coordinator, 'cr-1')).rejects.toThrow(NotFoundException);
      await expect(
        service.reject(coordinator, 'cr-1', { reason: 'no' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.eventChangeRequest.updateMany).not.toHaveBeenCalled();
    });

    it('treats an unassigned event the same way', async () => {
      currentEvent = event({ coordinatorId: null });
      access.isAssignedCoordinator.mockReturnValue(false);

      await expect(service.approve(coordinator, 'cr-1')).rejects.toThrow(NotFoundException);
    });

    it('reports a missing request as not found', async () => {
      prisma.eventChangeRequest.findUnique.mockResolvedValue(null);

      await expect(service.getForReview(coordinator, 'nope')).rejects.toThrow(NotFoundException);
    });

    it('asks the access layer for REVIEW on the request’s event', async () => {
      await service.getForReview(coordinator, 'cr-1');

      expect(access.assertEventAccess).toHaveBeenCalledWith(coordinator, 'event-1', Action.REVIEW);
    });
  });

  describe('AC-2: current vs proposed, plus the Organiser’s reason', () => {
    it('returns the request with its reason, and the event as it is now', async () => {
      requirements = [
        { id: 'r1', equipmentId: 'camera', equipmentType: 'Camera', quantity: 1, notes: null },
      ];

      const view = await service.getForReview(coordinator, 'cr-1');

      expect(view.request.reason).toBe('More people are coming');
      expect(view.request.proposedAttendance).toBe(99);
      expect(view.event).toMatchObject({
        id: 'event-1',
        proposedStart: eventStart,
        proposedEnd: eventEnd,
        expectedAttendance: 50,
        equipmentRequirements: [
          { id: 'r1', equipmentId: 'camera', equipmentType: 'Camera', quantity: 1 },
        ],
      });
    });
  });

  describe('AC-3 / AC-5: reject — a reason is recorded, the event is unchanged', () => {
    it('marks the request REJECTED with who, when and why', async () => {
      await service.reject(coordinator, 'cr-1', { reason: 'Venue is booked solid' });

      expect(prisma.eventChangeRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'cr-1', status: ChangeRequestStatus.PENDING },
        data: {
          status: ChangeRequestStatus.REJECTED,
          decidedById: 'coordinator-1',
          decidedAt: expect.any(Date),
          decisionReason: 'Venue is booked solid',
        },
      });
    });

    it('leaves the event, its equipment and its history alone', async () => {
      await service.reject(coordinator, 'cr-1', { reason: 'No' });

      expect(prisma.eventRequest.update).not.toHaveBeenCalled();
      expect(prisma.equipmentRequirement.deleteMany).not.toHaveBeenCalled();
      expect(prisma.equipmentRequirement.createMany).not.toHaveBeenCalled();
      expect(events.recordChange).not.toHaveBeenCalled();
    });

    it('returns the decided request so its reason can be shown', async () => {
      // Loaded as PENDING; re-read after the update as REJECTED.
      prisma.eventChangeRequest.findUniqueOrThrow.mockResolvedValue(
        request({ status: ChangeRequestStatus.REJECTED, decisionReason: 'Venue is booked solid' }),
      );

      const result = await service.reject(coordinator, 'cr-1', { reason: 'x' });

      expect(result.status).toBe(ChangeRequestStatus.REJECTED);
      expect(result.decisionReason).toBe('Venue is booked solid');
    });

    it.each([ChangeRequestStatus.APPROVED, ChangeRequestStatus.REJECTED])(
      'will not decide a request that is already %s',
      async (status) => {
        stored = request({ status });

        await expect(service.reject(coordinator, 'cr-1', { reason: 'x' })).rejects.toThrow(
          ConflictException,
        );
        expect(prisma.eventChangeRequest.updateMany).not.toHaveBeenCalled();
      },
    );

    it('loses a race to another decision with a conflict', async () => {
      prisma.eventChangeRequest.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.reject(coordinator, 'cr-1', { reason: 'x' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('can reject a request on an event that is no longer changeable', async () => {
      currentEvent = event({ status: EventStatus.CANCELLED });

      await service.reject(coordinator, 'cr-1', { reason: 'Event cancelled' });

      expect(prisma.eventChangeRequest.updateMany).toHaveBeenCalled();
    });
  });

  describe('AC-4: approve — the event is updated, the request approved, the change recorded', () => {
    it('updates the event to the proposed attendance and marks the request APPROVED', async () => {
      await service.approve(coordinator, 'cr-1');

      expect(prisma.eventChangeRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'cr-1', status: ChangeRequestStatus.PENDING },
        data: {
          status: ChangeRequestStatus.APPROVED,
          decidedById: 'coordinator-1',
          decidedAt: expect.any(Date),
        },
      });
      expect(prisma.eventRequest.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { expectedAttendance: 99 },
      });
    });

    it('writes only the fields the request proposes', async () => {
      stored = request({
        proposedAttendance: null,
        proposedStart: inDays(40, 9),
        proposedEnd: inDays(40, 17),
      });

      await service.approve(coordinator, 'cr-1');

      expect(prisma.eventRequest.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { proposedStart: inDays(40, 9), proposedEnd: inDays(40, 17) },
      });
    });

    it('records who changed what, previous and new, in the event’s history', async () => {
      await service.approve(coordinator, 'cr-1');

      const [tx, eventId, changedById, changes] = recorded();
      expect(tx).toBe(prisma);
      expect(eventId).toBe('event-1');
      expect(changedById).toBe('coordinator-1');
      expect(changes).toEqual([{ field: 'expectedAttendance', previous: 50, next: 99 }]);
    });

    it('flags the change for review when it touches a confirmed arrangement', async () => {
      events.confirmedArrangements.mockResolvedValue(['VENUE_BOOKING']);

      await service.approve(coordinator, 'cr-1');

      expect(recorded()[4]).toEqual(['VENUE_BOOKING']);
    });

    it('replaces the catalogue equipment lines and records the before and after', async () => {
      requirements = [
        { id: 'r1', equipmentId: 'camera', equipmentType: 'Camera', quantity: 1, notes: 'tripod' },
        { id: 'r2', equipmentId: 'mic', equipmentType: 'Microphone', quantity: 2, notes: null },
      ];
      stored = request({
        proposedAttendance: null,
        equipmentChanged: true,
        equipment: [cameraLine],
      });

      await service.approve(coordinator, 'cr-1');

      expect(requirements.map((r) => [r.equipmentType, r.quantity])).toEqual([['Camera', 3]]);
      expect(recorded()[3]).toEqual([
        {
          field: 'equipmentRequirements',
          previous: ['1 × Camera (tripod)', '2 × Microphone'],
          next: ['3 × Camera (tripod)'],
        },
      ]);
    });

    it('keeps the notes of a line that stays', async () => {
      requirements = [
        { id: 'r1', equipmentId: 'camera', equipmentType: 'Camera', quantity: 1, notes: 'tripod' },
      ];
      stored = request({ proposedAttendance: null, equipmentChanged: true, equipment: [cameraLine] });

      await service.approve(coordinator, 'cr-1');

      expect(requirements[0].notes).toBe('tripod');
    });

    it('deletes only catalogue-linked lines, leaving free-text lines in place', async () => {
      requirements = [
        { id: 'r1', equipmentId: null, equipmentType: 'Wheelchair', quantity: 4, notes: null },
      ];
      stored = request({ proposedAttendance: null, equipmentChanged: true, equipment: [cameraLine] });

      await service.approve(coordinator, 'cr-1');

      expect(prisma.equipmentRequirement.deleteMany).toHaveBeenCalledWith({
        where: { eventId: 'event-1', equipmentId: { not: null } },
      });
      expect(requirements.map((r) => r.equipmentType)).toEqual(['Wheelchair', 'Camera']);
    });

    it('removes all catalogue lines when the request proposes an empty list', async () => {
      requirements = [
        { id: 'r1', equipmentId: 'camera', equipmentType: 'Camera', quantity: 1, notes: null },
      ];
      stored = request({ proposedAttendance: null, equipmentChanged: true, equipment: [] });

      await service.approve(coordinator, 'cr-1');

      expect(prisma.equipmentRequirement.createMany).not.toHaveBeenCalled();
      expect(requirements).toEqual([]);
    });

    it('leaves equipment alone when the request does not propose equipment', async () => {
      await service.approve(coordinator, 'cr-1');

      expect(prisma.equipmentRequirement.deleteMany).not.toHaveBeenCalled();
    });

    it('writes no history entry when the event already has the proposed values', async () => {
      currentEvent = event({ expectedAttendance: 99 });

      const result = await service.approve(coordinator, 'cr-1');

      expect(events.recordChange).not.toHaveBeenCalled();
      expect(prisma.eventRequest.update).not.toHaveBeenCalled();
      expect(result.change).toBeNull();
    });

    it('runs everything in one transaction', async () => {
      await service.approve(coordinator, 'cr-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('does not change the event’s status', async () => {
      await service.approve(coordinator, 'cr-1');

      const data = prisma.eventRequest.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('status');
    });

    it.each([ChangeRequestStatus.APPROVED, ChangeRequestStatus.REJECTED])(
      'will not approve a request that is already %s',
      async (status) => {
        stored = request({ status });

        await expect(service.approve(coordinator, 'cr-1')).rejects.toThrow(ConflictException);
        expect(prisma.eventRequest.update).not.toHaveBeenCalled();
      },
    );

    it('changes nothing when another decision wins the race', async () => {
      prisma.eventChangeRequest.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.approve(coordinator, 'cr-1')).rejects.toThrow(ConflictException);
      expect(prisma.eventRequest.update).not.toHaveBeenCalled();
      expect(events.recordChange).not.toHaveBeenCalled();
    });

    it.each([EventStatus.CANCELLED, EventStatus.COMPLETED, EventStatus.REJECTED])(
      'will not apply a change to a %s event',
      async (status) => {
        currentEvent = event({ status });

        await expect(service.approve(coordinator, 'cr-1')).rejects.toThrow(ConflictException);
        expect(prisma.eventChangeRequest.updateMany).not.toHaveBeenCalled();
      },
    );

    it('will not move the event into the past', async () => {
      stored = request({ proposedAttendance: null, proposedStart: inDays(-2, 9) });

      await expect(service.approve(coordinator, 'cr-1')).rejects.toThrow(ConflictException);
      expect(prisma.eventRequest.update).not.toHaveBeenCalled();
    });

    it('will not leave the end before the start after the event was edited', async () => {
      stored = request({ proposedAttendance: null, proposedStart: inDays(31, 9) });
      currentEvent = event({ proposedEnd: inDays(30, 17) });

      await expect(service.approve(coordinator, 'cr-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('AC-6: a capacity warning before deciding', () => {
    const booking = (capacity: number | null, status: BookingStatus = BookingStatus.APPROVED) => ({
      id: 'booking-1',
      status,
      venue: { id: 'venue-1', name: 'Main Hall', capacity },
    });

    it('warns when the proposed attendance exceeds the booked venue’s capacity', async () => {
      prisma.venueBooking.findMany.mockResolvedValue([booking(60)]);

      const view = await service.getForReview(coordinator, 'cr-1');

      expect(view.warnings).toEqual([
        expect.objectContaining({
          type: 'CAPACITY_EXCEEDED',
          venueName: 'Main Hall',
          capacity: 60,
          proposedAttendance: 99,
          bookingId: 'booking-1',
          message: expect.stringContaining('exceeds the capacity of Main Hall (60)'),
        }),
      ]);
    });

    it('warns for a booking that is still only requested', async () => {
      prisma.venueBooking.findMany.mockResolvedValue([booking(60, BookingStatus.REQUESTED)]);

      expect((await service.getForReview(coordinator, 'cr-1')).warnings).toHaveLength(1);
    });

    it('does not warn when the attendance fits', async () => {
      prisma.venueBooking.findMany.mockResolvedValue([booking(99)]);

      expect((await service.getForReview(coordinator, 'cr-1')).warnings).toEqual([]);
    });

    it('does not warn when the event has no venue booking', async () => {
      expect((await service.getForReview(coordinator, 'cr-1')).warnings).toEqual([]);
    });

    it('does not warn about a venue with no recorded capacity', async () => {
      prisma.venueBooking.findMany.mockResolvedValue([booking(null)]);

      expect((await service.getForReview(coordinator, 'cr-1')).warnings).toEqual([]);
    });

    it('does not warn when the request does not change attendance', async () => {
      // Not a date change either, so nothing else is being assessed.
      stored = request({ proposedAttendance: null, equipmentChanged: true, equipment: [] });
      prisma.venueBooking.findMany.mockResolvedValue([booking(10)]);

      expect((await service.getForReview(coordinator, 'cr-1')).warnings).toEqual([]);
    });

    it('looks only at bookings that are not rejected (or released, or expired holds)', async () => {
      await service.getForReview(coordinator, 'cr-1');

      expect(prisma.venueBooking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            eventId: 'event-1',
            OR: [
              { status: { in: [BookingStatus.REQUESTED, BookingStatus.APPROVED] } },
              { status: BookingStatus.HELD, holdExpiresAt: { gt: expect.any(Date) } },
            ],
          },
        }),
      );
    });

    it('is a warning, not a block: the request can still be approved', async () => {
      prisma.venueBooking.findMany.mockResolvedValue([booking(10)]);

      await expect(service.approve(coordinator, 'cr-1')).resolves.toBeDefined();
    });
  });

  /**
   * An approved date or time change must not leave bookings and reservations on
   * the old dates (the briefing: no contradictory information).
   */
  // US-48 AC-7 replaced US-38's move (bookings back to REQUESTED, equipment
  // released) with a rebook for the new details; these tests follow it.
  describe('rescheduling: approving a date or time change rebooks the arrangements (US-48 AC-7)', () => {
    const newStart = inDays(40, 9);
    const newEnd = inDays(40, 17);
    const dateChange = () =>
      request({ proposedAttendance: null, proposedStart: newStart, proposedEnd: newEnd });

    describe('on approval', () => {
      it('US-48 AC-7: rebooks the venue bookings and equipment reservations, in the same transaction', async () => {
        stored = dateChange();

        await service.approve(coordinator, 'cr-1');

        expect(bookings.rebookForEventChange).toHaveBeenCalledWith(
          prisma,
          'event-1',
          { start: eventStart, end: eventEnd },
          { start: newStart, end: newEnd },
          null,
        );
        expect(reservations.rebookForEventChange).toHaveBeenCalledWith(
          'event-1',
          { start: newStart, end: newEnd },
          prisma,
        );
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      });

      it('US-48 AC-7: passes the proposed attendance to the rebooked venue bookings', async () => {
        stored = request({ proposedAttendance: 150, proposedStart: newStart, proposedEnd: newEnd });

        await service.approve(coordinator, 'cr-1');

        expect(bookings.rebookForEventChange.mock.calls[0][4]).toBe(150);
      });

      it('US-48 AC-7: reports what was rebooked, and records it in the event history', async () => {
        stored = dateChange();
        const venueMove = {
          bookingId: 'booking-1',
          replacementId: 'booking-2',
          venueName: 'Main Hall',
          from: { start: eventStart, end: eventEnd },
          to: { start: newStart, end: newEnd },
        };
        const equipmentMove = {
          reservationId: 'res-1',
          replacementId: 'res-2',
          equipmentType: 'Projector',
          quantity: 2,
          from: { start: eventStart, end: eventEnd },
          to: { start: newStart, end: newEnd },
        };
        bookings.rebookForEventChange.mockResolvedValue([venueMove]);
        reservations.rebookForEventChange.mockResolvedValue([equipmentMove]);

        const result = await service.approve(coordinator, 'cr-1');

        expect(result.arrangements).toEqual({
          venueBookings: [venueMove],
          equipmentReservations: [equipmentMove],
        });
        const [, , , changes] = recorded();
        expect(changes.map((c: { field: string }) => c.field)).toEqual([
          'proposedStart',
          'proposedEnd',
          'venueBookings',
          'equipmentReservations',
        ]);
        expect(changes[2].previous).toEqual([expect.stringMatching(/^Main Hall: /)]);
        expect(changes[3].next).toEqual([expect.stringMatching(/^2 × Projector: /)]);
      });

      it('keeps the existing end when only the start moves', async () => {
        stored = request({ proposedAttendance: null, proposedStart: inDays(30, 10) });

        await service.approve(coordinator, 'cr-1');

        expect(bookings.rebookForEventChange).toHaveBeenCalledWith(
          prisma,
          'event-1',
          { start: eventStart, end: eventEnd },
          { start: inDays(30, 10), end: eventEnd },
          null,
        );
      });

      it('leaves bookings and equipment alone for an attendance-only change', async () => {
        await service.approve(coordinator, 'cr-1');

        expect(bookings.rebookForEventChange).not.toHaveBeenCalled();
        expect(reservations.rebookForEventChange).not.toHaveBeenCalled();
      });

      it('leaves them alone for an equipment-only change', async () => {
        stored = request({ proposedAttendance: null, equipmentChanged: true, equipment: [] });

        await service.approve(coordinator, 'cr-1');

        expect(bookings.rebookForEventChange).not.toHaveBeenCalled();
        expect(reservations.rebookForEventChange).not.toHaveBeenCalled();
      });

      it('leaves them alone when the event already has the proposed dates', async () => {
        stored = request({
          proposedAttendance: null,
          proposedStart: eventStart,
          proposedEnd: eventEnd,
        });

        await service.approve(coordinator, 'cr-1');

        expect(bookings.rebookForEventChange).not.toHaveBeenCalled();
      });

      it('rebooks nothing when another decision wins the race', async () => {
        stored = dateChange();
        prisma.eventChangeRequest.updateMany.mockResolvedValue({ count: 0 });

        await expect(service.approve(coordinator, 'cr-1')).rejects.toThrow(ConflictException);
        expect(bookings.rebookForEventChange).not.toHaveBeenCalled();
        expect(reservations.rebookForEventChange).not.toHaveBeenCalled();
      });

      it('rebooks nothing when the approval is refused', async () => {
        stored = request({ proposedAttendance: null, proposedStart: inDays(-2, 9) });

        await expect(service.approve(coordinator, 'cr-1')).rejects.toThrow(ConflictException);
        expect(bookings.rebookForEventChange).not.toHaveBeenCalled();
      });

      it('does not touch arrangements when the request is rejected', async () => {
        stored = dateChange();

        await service.reject(coordinator, 'cr-1', { reason: 'No' });

        expect(bookings.rebookForEventChange).not.toHaveBeenCalled();
        expect(reservations.rebookForEventChange).not.toHaveBeenCalled();
      });
    });

    // US-48 replaced US-38's "impact and clash warnings" with the check of the
    // arrangements against the proposed details (AC-1..AC-6).
    describe('before deciding: the arrangement check (US-48 AC-1..AC-6)', () => {
      const booking = (overrides: Record<string, unknown> = {}) => ({
        id: 'booking-1',
        status: BookingStatus.APPROVED,
        start: inDays(30, 8),
        end: inDays(30, 18),
        venueId: 'venue-1',
        venue: { id: 'venue-1', name: 'Main Hall', capacity: 200 },
        ...overrides,
      });
      const reservation = () => ({
        id: 'res-1',
        quantity: 5,
        status: ReservationStatus.APPROVED,
        start: eventStart,
        end: eventEnd,
        equipment: {
          id: 'projector',
          type: 'Projector',
          totalQuantity: 6,
          operationalStatus: EquipmentStatus.OPERATIONAL,
        },
      });
      const hard = (eventName: string, bookingId = 'rival') => ({
        hardConflicts: [{ bookingId, eventName, start: newStart, end: newEnd }],
        softConflicts: [],
        blocks: [],
        hasHardConflict: true,
      });

      // The event's own rows are looked up by eventId; other events' by AND.
      const mockBookings = (own: unknown[]) =>
        prisma.venueBooking.findMany.mockImplementation(({ where }) =>
          Promise.resolve(where.eventId ? own : []),
        );
      const mockReservations = (own: unknown[], others: unknown[] = []) =>
        prisma.equipmentReservation.findMany.mockImplementation(({ where }) =>
          Promise.resolve(where.AND ? others : own),
        );

      beforeEach(() => {
        stored = dateChange();
      });

      it('US-48 AC-6: lists each booking that would move, by the event’s offset', async () => {
        mockBookings([booking()]);

        const { check } = await service.getForReview(coordinator, 'cr-1');

        expect(check.newWindow).toEqual({ start: newStart, end: newEnd });
        expect(check.venueBookings).toEqual([
          {
            bookingId: 'booking-1',
            venueId: 'venue-1',
            venueName: 'Main Hall',
            status: BookingStatus.APPROVED,
            current: { start: inDays(30, 8), end: inDays(30, 18) },
            proposed: { start: inDays(40, 8), end: inDays(40, 18) },
            moves: true,
            available: true,
            conflicts: [],
            capacityWarning: null,
          },
        ]);
      });

      it('US-48 AC-6: lists the reservations that would move to the new time', async () => {
        mockReservations([reservation()]);

        const { check } = await service.getForReview(coordinator, 'cr-1');

        expect(check.equipmentReservations).toEqual([
          {
            equipmentId: 'projector',
            equipmentType: 'Projector',
            reservationIds: ['res-1'],
            quantity: 5,
            status: ReservationStatus.APPROVED,
            current: { start: eventStart, end: eventEnd },
            proposed: { start: newStart, end: newEnd },
            available: true,
            reason: null,
          },
        ]);
      });

      it('US-48 AC-2/AC-4: a confirmed booking at the new time is a conflict, with its reason', async () => {
        mockBookings([booking()]);
        bookings.conflictsFor.mockResolvedValue(hard('Gala'));

        const { check } = await service.getForReview(coordinator, 'cr-1');

        expect(check.canApprove).toBe(false);
        expect(check.conflicts).toEqual([
          {
            kind: 'VENUE_BOOKING',
            label: 'Venue booking at Main Hall',
            reason:
              'Main Hall is already booked for "Gala" at the new time (setup and turnaround included).',
          },
        ]);
      });

      it('US-48 AC-2: asks the shared buffer-aware check, at the moved window, excluding itself', async () => {
        mockBookings([booking()]);

        await service.getForReview(coordinator, 'cr-1');

        expect(bookings.conflictsFor).toHaveBeenCalledWith(
          prisma,
          'venue-1',
          inDays(40, 8),
          inDays(40, 18),
          'booking-1',
        );
      });

      it('US-48: the event never conflicts with its own other bookings', async () => {
        mockBookings([booking(), booking({ id: 'booking-2', venueId: 'venue-1' })]);
        bookings.conflictsFor.mockImplementation((_db, _venue, _s, _e, self) =>
          Promise.resolve(hard('Hackathon', self === 'booking-1' ? 'booking-2' : 'booking-1')),
        );

        const { check } = await service.getForReview(coordinator, 'cr-1');

        expect(check.canApprove).toBe(true);
        expect(check.venueBookings.every((b) => b.available)).toBe(true);
      });

      it('US-48 AC-2/AC-4: a blocked-out period at the new time is a conflict', async () => {
        mockBookings([booking()]);
        bookings.conflictsFor.mockResolvedValue({
          hardConflicts: [],
          softConflicts: [],
          blocks: [{ blockId: 'b', reason: 'Renovation', start: newStart, end: newEnd }],
          hasHardConflict: true,
        });

        const { check } = await service.getForReview(coordinator, 'cr-1');

        expect(check.conflicts.map((c) => c.reason)).toEqual([
          'Main Hall is unavailable at the new time (Renovation).',
        ]);
      });

      it('US-48 AC-3/AC-4: too little equipment free at the new time is a conflict, with how many', async () => {
        mockReservations([reservation()], [{ quantity: 3, start: newStart, end: newEnd }]);

        const { check } = await service.getForReview(coordinator, 'cr-1');

        expect(check.conflicts).toEqual([
          {
            kind: 'EQUIPMENT_RESERVATION',
            label: '5 × Projector reservation',
            reason: 'Only 3 of 5 Projector free for the new time.',
          },
        ]);
      });

      it('US-48: counts only other events’ reservations, never this event’s own', async () => {
        mockReservations([reservation()]);

        await service.getForReview(coordinator, 'cr-1');

        const othersQuery = prisma.equipmentReservation.findMany.mock.calls.find(
          ([args]) => args.where.AND,
        )![0];
        expect(othersQuery.where.AND).toContainEqual({ eventId: { not: 'event-1' } });
      });

      it('US-48 AC-4: reports everything as working when it all still fits', async () => {
        mockBookings([booking()]);
        mockReservations([reservation()]);

        const { check, warnings } = await service.getForReview(coordinator, 'cr-1');

        expect(check.canApprove).toBe(true);
        expect(check.conflicts).toEqual([]);
        expect(check.works.map((w) => w.label)).toEqual([
          'Venue booking at Main Hall',
          '5 × Projector reservation',
        ]);
        expect(warnings).toEqual([]);
      });

      it('US-48: moves nothing, and checks no venue, when the request moves no dates', async () => {
        stored = request();
        mockBookings([booking()]);

        const { check } = await service.getForReview(coordinator, 'cr-1');

        expect(check.newWindow).toBeNull();
        expect(check.venueBookings.map((b) => b.moves)).toEqual([false]);
        expect(check.equipmentReservations).toEqual([]);
        expect(bookings.conflictsFor).not.toHaveBeenCalled();
      });

      it('US-48 AC-1: only reads — opening a request writes nothing', async () => {
        mockBookings([booking()]);
        mockReservations([reservation()]);

        await service.getForReview(coordinator, 'cr-1');

        expect(prisma.eventRequest.update).not.toHaveBeenCalled();
        expect(prisma.eventChangeRequest.updateMany).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(bookings.rebookForEventChange).not.toHaveBeenCalled();
        expect(reservations.rebookForEventChange).not.toHaveBeenCalled();
      });
    });

    describe('approving re-runs the check (US-48 AC-7/AC-8/AC-9)', () => {
      beforeEach(() => {
        stored = dateChange();
        prisma.venueBooking.findMany.mockImplementation(({ where }) =>
          Promise.resolve(
            where.eventId
              ? [
                  {
                    id: 'booking-1',
                    status: BookingStatus.APPROVED,
                    start: eventStart,
                    end: eventEnd,
                    venueId: 'venue-1',
                    venue: { id: 'venue-1', name: 'Main Hall', capacity: 200 },
                  },
                ]
              : [],
          ),
        );
      });

      it('US-48 AC-7: locks the event, its venues and its equipment before checking', async () => {
        prisma.equipmentReservation.findMany.mockImplementation(({ where }) =>
          Promise.resolve(
            where.AND
              ? []
              : [
                  {
                    id: 'res-1',
                    equipmentId: 'projector',
                    quantity: 2,
                    status: ReservationStatus.APPROVED,
                    start: eventStart,
                    end: eventEnd,
                    equipment: {
                      id: 'projector',
                      type: 'Projector',
                      totalQuantity: 6,
                      operationalStatus: EquipmentStatus.OPERATIONAL,
                    },
                  },
                ],
          ),
        );

        await service.approve(coordinator, 'cr-1');

        expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
        expect(bookings.lockVenue).toHaveBeenCalledWith(prisma, 'venue-1');
        expect(reservations.lockEquipment).toHaveBeenCalledWith(prisma, 'projector');
      });

      it('US-48 AC-8: a conflict at approval is refused with 409, changing nothing — the request stays pending', async () => {
        bookings.conflictsFor.mockResolvedValue({
          hardConflicts: [{ bookingId: 'rival', eventName: 'Gala', start: newStart, end: newEnd }],
          softConflicts: [],
          blocks: [],
          hasHardConflict: true,
        });

        const error = await service.approve(coordinator, 'cr-1').catch((e) => e);

        expect(error).toBeInstanceOf(ConflictException);
        expect(error.getResponse()).toEqual({
          statusCode: 409,
          error: 'Conflict',
          code: 'CHANGE_REQUEST_CHECK_FAILED',
          message: expect.stringContaining('Main Hall is already booked for "Gala"'),
          conflicts: [
            expect.objectContaining({
              kind: 'VENUE_BOOKING',
              reason: expect.stringContaining('Main Hall is already booked for "Gala"'),
            }),
          ],
        });
        expect(prisma.eventRequest.update).not.toHaveBeenCalled();
        expect(bookings.rebookForEventChange).not.toHaveBeenCalled();
        expect(reservations.rebookForEventChange).not.toHaveBeenCalled();
        expect(events.recordChange).not.toHaveBeenCalled();
        // Refused before the claim: the request is never written, not even rejected.
        expect(prisma.eventChangeRequest.updateMany).not.toHaveBeenCalled();
      });

      it('US-48 AC-8: the database backstop (US-24) is refused the same way, not rejected', async () => {
        bookings.rebookForEventChange.mockRejectedValue(
          new Prisma.PrismaClientUnknownRequestError('violates exclusion constraint 23P01', {
            clientVersion: 'test',
          }),
        );

        const error = await service.approve(coordinator, 'cr-1').catch((e) => e);

        expect(error.getResponse()).toMatchObject({
          code: 'CHANGE_REQUEST_CHECK_FAILED',
          conflicts: [
            expect.objectContaining({
              reason: 'A venue booking was confirmed at the new time while this request was being approved.',
            }),
          ],
        });
        // Only the (rolled-back) claim was attempted; no rejection was written.
        expect(prisma.eventChangeRequest.updateMany).toHaveBeenCalledTimes(1);
        expect(prisma.eventChangeRequest.updateMany.mock.calls[0][0].data.status).toBe(
          ChangeRequestStatus.APPROVED,
        );
        expect(notifications.notifySafely).not.toHaveBeenCalled();
      });

      it('US-48 AC-9: notifies the Organiser of an approval', async () => {
        await service.approve(coordinator, 'cr-1');

        expect(notifications.notifySafely).toHaveBeenCalledWith({
          recipientId: 'organiser-1',
          type: 'CHANGE_REQUEST_DECIDED',
          message: 'Your change request for "Hackathon" was approved; the event has been updated.',
          relatedEventId: 'event-1',
        });
      });

      it('US-48 AC-9: a refused approval decides nothing, so notifies no one', async () => {
        bookings.conflictsFor.mockResolvedValue({
          hardConflicts: [],
          softConflicts: [],
          blocks: [{ blockId: 'b', reason: 'Renovation', start: newStart, end: newEnd }],
          hasHardConflict: true,
        });

        await expect(service.approve(coordinator, 'cr-1')).rejects.toThrow(ConflictException);

        expect(notifications.notifySafely).not.toHaveBeenCalled();
      });

      it('US-48 AC-9: notifies the Organiser of a Coordinator’s rejection, with the reason', async () => {
        await service.reject(coordinator, 'cr-1', { reason: 'The hall is needed elsewhere.' });

        expect(notifications.notifySafely).toHaveBeenCalledWith(
          expect.objectContaining({
            recipientId: 'organiser-1',
            message:
              'Your change request for "Hackathon" was rejected. Reason: The hall is needed elsewhere.',
          }),
        );
      });

      it('US-48 AC-8: an unexpected failure rolls back and leaves the request pending', async () => {
        bookings.rebookForEventChange.mockRejectedValue(new Error('connection lost'));

        await expect(service.approve(coordinator, 'cr-1')).rejects.toThrow('connection lost');

        // No rejection was recorded: only the (rolled-back) claim was attempted.
        expect(prisma.eventChangeRequest.updateMany).toHaveBeenCalledTimes(1);
        expect(notifications.notifySafely).not.toHaveBeenCalled();
      });
    });
  });

  describe('Attendee notice: an approved date or time change notifies registered Attendees', () => {
    let notifier: { notifyRegisteredAttendees: jest.Mock };
    let noticeService: EventsChangeReviewService;

    beforeEach(() => {
      notifier = { notifyRegisteredAttendees: jest.fn().mockResolvedValue(0) };
      // The real recordChange returns the saved entry, including what changed.
      events.recordChange.mockImplementation((_tx, _id, _by, changes) =>
        Promise.resolve({ id: 'change-1', changes }),
      );
      noticeService = new EventsChangeReviewService(
        prisma as unknown as PrismaService,
        access as unknown as AccessControlService,
        events as unknown as EventsService,
        bookings as unknown as BookingsService,
        reservations as unknown as EquipmentReservationsService,
        new ChangeArrangementCheckService(bookings as unknown as BookingsService),
        notifications as unknown as NotificationsService,
        { approvedBookingChanged: jest.fn() } as unknown as VenueActivityNotifier,
        notifier as never,
      );
    });

    const noticed = () => notifier.notifyRegisteredAttendees.mock.calls.flatMap(([, c]) => c);

    it('AC-1/AC-3: names the event and each changed field with old and new value', async () => {
      stored = request({ proposedStart: inDays(29, 9), proposedAttendance: null });

      await noticeService.approve(coordinator, 'cr-1');

      expect(notifier.notifyRegisteredAttendees).toHaveBeenCalledTimes(1);
      expect(notifier.notifyRegisteredAttendees.mock.calls[0][0]).toMatchObject({
        id: 'event-1',
        name: 'Hackathon',
      });
      expect(noticed()).toHaveLength(1);
      expect(noticed()[0]).toMatchObject({ label: 'Start' });
      expect(noticed()[0].previous).not.toBe(noticed()[0].next);
    });

    it('AC-4: start and end moved by one approval are one notice listing both', async () => {
      stored = request({
        proposedStart: inDays(40, 9),
        proposedEnd: inDays(40, 17),
        proposedAttendance: null,
      });

      await noticeService.approve(coordinator, 'cr-1');

      expect(notifier.notifyRegisteredAttendees).toHaveBeenCalledTimes(1);
      expect(noticed().map((c) => c.label)).toEqual(['Start', 'End']);
    });

    it('AC-6: an approval that only changes attendance notifies nobody', async () => {
      await noticeService.approve(coordinator, 'cr-1');

      expect(noticed()).toEqual([]);
    });

    it('AC-6: an approval that only changes equipment notifies nobody', async () => {
      stored = request({
        proposedAttendance: null,
        equipmentChanged: true,
        equipment: [cameraLine],
      });

      await noticeService.approve(coordinator, 'cr-1');

      expect(noticed()).toEqual([]);
    });

    it('a rejected change request notifies no Attendee', async () => {
      await noticeService.reject(coordinator, 'cr-1', { reason: 'No room' });

      expect(notifier.notifyRegisteredAttendees).not.toHaveBeenCalled();
    });

    it('a refused approval notifies no Attendee', async () => {
      currentEvent = event({ status: EventStatus.CANCELLED });

      await expect(noticeService.approve(coordinator, 'cr-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(notifier.notifyRegisteredAttendees).not.toHaveBeenCalled();
    });
  });
});
