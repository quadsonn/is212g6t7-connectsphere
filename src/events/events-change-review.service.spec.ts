import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  BookingStatus,
  ChangeRequestStatus,
  EquipmentStatus,
  EventStatus,
  ReservationStatus,
  Role,
} from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { BookingsService } from '../bookings/bookings.service';
import { EquipmentReservationsService } from '../equipment/equipment-reservations.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsChangeReviewService } from './events-change-review.service';
import { EventsService } from './events.service';

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
    $transaction: jest.Mock;
  };
  let access: {
    requireScope: jest.Mock;
    assertEventAccess: jest.Mock;
    isAssignedCoordinator: jest.Mock;
  };
  let events: { recordChange: jest.Mock; confirmedArrangements: jest.Mock };
  let bookings: { rescheduleForEventChange: jest.Mock };
  let reservations: { releaseForRescheduledEvent: jest.Mock };
  let service: EventsChangeReviewService;
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
    bookings = { rescheduleForEventChange: jest.fn().mockResolvedValue([]) };
    reservations = { releaseForRescheduledEvent: jest.fn().mockResolvedValue([]) };
    service = new EventsChangeReviewService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      events as unknown as EventsService,
      bookings as unknown as BookingsService,
      reservations as unknown as EquipmentReservationsService,
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

    it('looks only at bookings that are not rejected', async () => {
      await service.getForReview(coordinator, 'cr-1');

      expect(prisma.venueBooking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            eventId: 'event-1',
            status: { in: [BookingStatus.REQUESTED, BookingStatus.APPROVED] },
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
  describe('rescheduling: approving a date or time change moves the arrangements', () => {
    const newStart = inDays(40, 9);
    const newEnd = inDays(40, 17);
    const dateChange = () =>
      request({ proposedAttendance: null, proposedStart: newStart, proposedEnd: newEnd });

    describe('on approval', () => {
      it('moves the venue bookings and releases the equipment, in the same transaction', async () => {
        stored = dateChange();

        await service.approve(coordinator, 'cr-1');

        expect(bookings.rescheduleForEventChange).toHaveBeenCalledWith(
          prisma,
          'event-1',
          { start: eventStart, end: eventEnd },
          { start: newStart, end: newEnd },
        );
        expect(reservations.releaseForRescheduledEvent).toHaveBeenCalledWith('event-1', prisma);
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      });

      it('reports what was moved and released', async () => {
        stored = dateChange();
        const moved = [{ bookingId: 'booking-1' }];
        const released = [{ reservationId: 'res-1' }];
        bookings.rescheduleForEventChange.mockResolvedValue(moved);
        reservations.releaseForRescheduledEvent.mockResolvedValue(released);

        const result = await service.approve(coordinator, 'cr-1');

        expect(result.arrangements).toEqual({
          venueBookings: moved,
          equipmentReservations: released,
        });
      });

      it('keeps the existing end when only the start moves', async () => {
        stored = request({ proposedAttendance: null, proposedStart: inDays(30, 10) });

        await service.approve(coordinator, 'cr-1');

        expect(bookings.rescheduleForEventChange).toHaveBeenCalledWith(
          prisma,
          'event-1',
          { start: eventStart, end: eventEnd },
          { start: inDays(30, 10), end: eventEnd },
        );
      });

      it('leaves bookings and equipment alone for an attendance-only change', async () => {
        await service.approve(coordinator, 'cr-1');

        expect(bookings.rescheduleForEventChange).not.toHaveBeenCalled();
        expect(reservations.releaseForRescheduledEvent).not.toHaveBeenCalled();
      });

      it('leaves them alone for an equipment-only change', async () => {
        stored = request({ proposedAttendance: null, equipmentChanged: true, equipment: [] });

        await service.approve(coordinator, 'cr-1');

        expect(bookings.rescheduleForEventChange).not.toHaveBeenCalled();
        expect(reservations.releaseForRescheduledEvent).not.toHaveBeenCalled();
      });

      it('leaves them alone when the event already has the proposed dates', async () => {
        stored = request({
          proposedAttendance: null,
          proposedStart: eventStart,
          proposedEnd: eventEnd,
        });

        await service.approve(coordinator, 'cr-1');

        expect(bookings.rescheduleForEventChange).not.toHaveBeenCalled();
      });

      it('moves nothing when another decision wins the race', async () => {
        stored = dateChange();
        prisma.eventChangeRequest.updateMany.mockResolvedValue({ count: 0 });

        await expect(service.approve(coordinator, 'cr-1')).rejects.toThrow(ConflictException);
        expect(bookings.rescheduleForEventChange).not.toHaveBeenCalled();
        expect(reservations.releaseForRescheduledEvent).not.toHaveBeenCalled();
      });

      it('moves nothing when the approval is refused', async () => {
        stored = request({ proposedAttendance: null, proposedStart: inDays(-2, 9) });

        await expect(service.approve(coordinator, 'cr-1')).rejects.toThrow(ConflictException);
        expect(bookings.rescheduleForEventChange).not.toHaveBeenCalled();
      });

      it('does not touch arrangements when the request is rejected', async () => {
        stored = dateChange();

        await service.reject(coordinator, 'cr-1', { reason: 'No' });

        expect(bookings.rescheduleForEventChange).not.toHaveBeenCalled();
        expect(reservations.releaseForRescheduledEvent).not.toHaveBeenCalled();
      });
    });

    describe('before deciding: the impact and any clash at the new time', () => {
      const booking = () => ({
        id: 'booking-1',
        status: BookingStatus.APPROVED,
        start: inDays(30, 8),
        end: inDays(30, 18),
        venue: { id: 'venue-1', name: 'Main Hall', capacity: 200 },
      });
      const reservation = () => ({
        id: 'res-1',
        quantity: 5,
        status: ReservationStatus.APPROVED,
        equipment: {
          id: 'projector',
          type: 'Projector',
          totalQuantity: 6,
          operationalStatus: EquipmentStatus.OPERATIONAL,
        },
      });

      // The event's own bookings are looked up by eventId, rivals by venueId.
      const mockBookings = (own: unknown[], rivals: unknown[] = []) =>
        prisma.venueBooking.findMany.mockImplementation(({ where }) =>
          Promise.resolve(where.eventId ? own : rivals),
        );

      beforeEach(() => {
        stored = dateChange();
      });

      it('lists each booking moving with the same offset, keeping setup and teardown time', async () => {
        mockBookings([booking()]);

        const { impact } = await service.getForReview(coordinator, 'cr-1');

        expect(impact.newWindow).toEqual({ start: newStart, end: newEnd });
        expect(impact.venueBookings).toEqual([
          {
            bookingId: 'booking-1',
            venueName: 'Main Hall',
            status: BookingStatus.APPROVED,
            from: { start: inDays(30, 8), end: inDays(30, 18) },
            to: { start: inDays(40, 8), end: inDays(40, 18) },
          },
        ]);
      });

      it('lists the equipment that would be released', async () => {
        prisma.equipmentReservation.findMany.mockResolvedValueOnce([reservation()]);

        const { impact } = await service.getForReview(coordinator, 'cr-1');

        expect(impact.equipmentReservations).toEqual([
          {
            reservationId: 'res-1',
            equipmentType: 'Projector',
            quantity: 5,
            status: ReservationStatus.APPROVED,
          },
        ]);
      });

      it('warns when a confirmed booking already holds the venue at the new time', async () => {
        mockBookings([booking()], [{ event: { name: 'Gala' } }]);

        const { warnings } = await service.getForReview(coordinator, 'cr-1');

        expect(warnings).toEqual([
          {
            type: 'VENUE_CONFLICT',
            message: 'Main Hall is already booked for "Gala" at the new time.',
          },
        ]);
      });

      it('checks rivals only against confirmed bookings of the same venue, not itself', async () => {
        mockBookings([booking()]);

        await service.getForReview(coordinator, 'cr-1');

        expect(prisma.venueBooking.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              venueId: 'venue-1',
              id: { not: 'booking-1' },
              status: BookingStatus.APPROVED,
              start: { lt: inDays(40, 18) },
              end: { gt: inDays(40, 8) },
            },
          }),
        );
      });

      it('warns when the venue is blocked out at the new time', async () => {
        mockBookings([booking()]);
        prisma.venueBlock.findMany.mockResolvedValue([{ reason: 'Renovation' }]);

        const { warnings } = await service.getForReview(coordinator, 'cr-1');

        expect(warnings).toEqual([
          {
            type: 'VENUE_BLOCKED',
            message: 'Main Hall is blocked out at the new time (Renovation).',
          },
        ]);
      });

      it('warns when there is not enough equipment free at the new time', async () => {
        prisma.equipmentReservation.findMany
          .mockResolvedValueOnce([reservation()])
          .mockResolvedValueOnce([{ quantity: 3, start: newStart, end: newEnd }]);

        const { warnings } = await service.getForReview(coordinator, 'cr-1');

        expect(warnings).toEqual([
          {
            type: 'EQUIPMENT_UNAVAILABLE',
            message: '5 × Projector may not be available at the new time (3 free).',
          },
        ]);
      });

      it('does not count the reservation being moved against itself', async () => {
        prisma.equipmentReservation.findMany
          .mockResolvedValueOnce([reservation()])
          .mockResolvedValueOnce([]);

        await service.getForReview(coordinator, 'cr-1');

        expect(prisma.equipmentReservation.findMany.mock.calls[1][0].where.AND).toContainEqual({
          id: { not: 'res-1' },
        });
      });

      it('reports no warnings when everything still fits', async () => {
        mockBookings([booking()]);
        prisma.equipmentReservation.findMany
          .mockResolvedValueOnce([reservation()])
          .mockResolvedValueOnce([]);

        expect((await service.getForReview(coordinator, 'cr-1')).warnings).toEqual([]);
      });

      it('reports no impact when the request moves no dates', async () => {
        stored = request();
        mockBookings([booking()]);

        const view = await service.getForReview(coordinator, 'cr-1');

        expect(view.impact).toEqual({
          newWindow: null,
          venueBookings: [],
          equipmentReservations: [],
        });
        expect(prisma.venueBlock.findMany).not.toHaveBeenCalled();
      });
    });
  });
});
