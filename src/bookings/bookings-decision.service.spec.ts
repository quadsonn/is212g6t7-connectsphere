import { ConflictException, NotFoundException } from '@nestjs/common';
import { BookingDecisionKind, BookingStatus, NotificationType, Role } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AccessControlService } from '../common/access/access-control.service';
import { Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from './bookings.service';
import { canDecide } from './booking.types';
import { ApproveBookingDto, RejectBookingDto, ReverseBookingDto } from './dto/booking-decision.dto';

/** US-23 — Approve/Reject Booking Request with Reason. */
describe('BookingsService decisions (US-23)', () => {
  let prisma: {
    venueBooking: {
      findFirst: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    bookingDecision: { create: jest.Mock };
    venueBlock: { findMany: jest.Mock };
    $executeRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let access: { requireScope: jest.Mock };
  let notifications: { notifySafely: jest.Mock };
  let service: BookingsService;

  const staff: AuthenticatedUser = { userId: 'staff-1', role: Role.VENUE_STAFF, jti: 'j1' };

  const stored = (status: BookingStatus = BookingStatus.REQUESTED) => ({
    id: 'booking-1',
    venueId: 'venue-1',
    eventId: 'event-1',
    start: new Date('2030-10-01T09:00:00Z'),
    end: new Date('2030-10-01T12:00:00Z'),
    status,
  });

  const decided = (status: BookingStatus, reason: string | null) => ({
    ...stored(status),
    decisionReason: reason,
    requestedById: 'coord-1',
    venue: { name: 'Main Hall' },
    event: { name: 'Showcase', organiser: { id: 'organiser-1' } },
  });

  beforeEach(() => {
    prisma = {
      venueBooking: {
        findFirst: jest.fn().mockResolvedValue(stored()),
        findUniqueOrThrow: jest.fn().mockResolvedValue(stored()),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve(decided(data.status, data.decisionReason))),
      },
      bookingDecision: { create: jest.fn().mockResolvedValue({}) },
      venueBlock: { findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn) => fn(prisma));
    access = { requireScope: jest.fn().mockReturnValue(Scope.ANY) };
    notifications = { notifySafely: jest.fn().mockResolvedValue(undefined) };

    service = new BookingsService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      notifications as unknown as NotificationsService,
    );
  });

  const decisionRow = () => prisma.bookingDecision.create.mock.calls[0][0].data;

  describe('AC-1: actions act on a request the staff member can open', () => {
    it('only finds requests for venues the caller manages', async () => {
      prisma.venueBooking.findFirst.mockResolvedValue(null);

      await expect(service.approve(staff, 'booking-1', {})).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.venueBooking.findFirst).toHaveBeenCalledWith({
        where: { id: 'booking-1', venue: { managedById: 'staff-1' } },
      });
    });
  });

  describe('AC-2: rejecting requires a reason', () => {
    it('the DTO refuses an empty reason', async () => {
      const errors = await validate(plainToInstance(RejectBookingDto, { reason: '' }));

      expect(errors[0].constraints).toMatchObject({
        isNotEmpty: 'a reason is required to reject this booking request',
      });
    });

    it('records the reason with the rejection', async () => {
      const result = await service.reject(staff, 'booking-1', { reason: '  Double-booked  ' });

      expect(decisionRow()).toMatchObject({ outcome: BookingStatus.REJECTED, reason: 'Double-booked' });
      expect(result.status).toBe(BookingStatus.REJECTED);
      expect(result.decisionReason).toBe('Double-booked');
    });
  });

  describe('AC-3: approving allows an optional note', () => {
    it('the DTO accepts no note', async () => {
      expect(await validate(plainToInstance(ApproveBookingDto, {}))).toEqual([]);
    });

    it('approves without a note', async () => {
      const result = await service.approve(staff, 'booking-1', {});

      expect(decisionRow()).toMatchObject({ outcome: BookingStatus.APPROVED, reason: null });
      expect(result.status).toBe(BookingStatus.APPROVED);
    });

    it('records a note when given', async () => {
      await service.approve(staff, 'booking-1', { note: 'Setup from 8am' });

      expect(decisionRow().reason).toBe('Setup from 8am');
    });
  });

  describe('AC-4: the decision is timestamped and attributed', () => {
    it('writes a decision row attributed to the caller, in the same transaction', async () => {
      await service.approve(staff, 'booking-1', {});

      expect(decisionRow()).toEqual({
        bookingId: 'booking-1',
        decidedById: 'staff-1',
        kind: BookingDecisionKind.DECISION,
        outcome: BookingStatus.APPROVED,
        reason: null,
      });
      // createdAt is the database default — the timestamp is set by Postgres.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('AC-5: the Coordinator and Organiser are told', () => {
    it('notifies the requester and the organiser', async () => {
      await service.reject(staff, 'booking-1', { reason: 'Maintenance' });

      const recipients = notifications.notifySafely.mock.calls.map((c) => c[0].recipientId);
      expect(recipients.sort()).toEqual(['coord-1', 'organiser-1']);
      expect(notifications.notifySafely.mock.calls[0][0]).toMatchObject({
        type: NotificationType.VENUE_BOOKING_DECIDED,
        relatedEventId: 'event-1',
        message: expect.stringContaining('Maintenance'),
      });
    });

    it('starts the message with a capital letter', async () => {
      await service.approve(staff, 'booking-1', {});

      expect(notifications.notifySafely.mock.calls[0][0].message).toBe(
        'The booking of Main Hall for "Showcase" was approved.',
      );
    });

    it('keeps the reason after the sentence, still capitalised', async () => {
      await service.reject(staff, 'booking-1', { reason: 'Maintenance' });

      expect(notifications.notifySafely.mock.calls[0][0].message).toBe(
        'The booking of Main Hall for "Showcase" was rejected. Reason: Maintenance',
      );
    });

    it('lets the Organiser read bookings on their own events', async () => {
      access.requireScope.mockReturnValue(Scope.OWN);
      const organiser = { userId: 'organiser-1', role: Role.EVENT_ORGANISER, jti: 'j2' };

      await service.findForEvent(organiser, 'event-1');

      expect(prisma.venueBooking.findMany.mock.calls[0][0].where).toEqual({
        AND: [{ eventId: 'event-1' }, { event: { organiserId: 'organiser-1' } }],
      });
    });
  });

  describe('AC-6: a reversal is a new recorded action', () => {
    it('the DTO requires a reason', async () => {
      const errors = await validate(plainToInstance(ReverseBookingDto, {}));

      expect(errors).toHaveLength(1);
    });

    it('flips an approval to a rejection with a REVERSAL row, never updating history', async () => {
      prisma.venueBooking.findFirst.mockResolvedValue(stored(BookingStatus.APPROVED));
      prisma.venueBooking.findUniqueOrThrow.mockResolvedValue(stored(BookingStatus.APPROVED));

      const result = await service.reverse(staff, 'booking-1', { reason: 'Venue flooded' });

      expect(decisionRow()).toMatchObject({
        kind: BookingDecisionKind.REVERSAL,
        outcome: BookingStatus.REJECTED,
        reason: 'Venue flooded',
      });
      expect(result.status).toBe(BookingStatus.REJECTED);
      expect(prisma.bookingDecision).not.toHaveProperty('update');
    });

    it('cannot reverse a request that has not been decided', async () => {
      await expect(
        service.reverse(staff, 'booking-1', { reason: 'x' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.bookingDecision.create).not.toHaveBeenCalled();
    });
  });

  describe('AC-7: the same request cannot be decided twice', () => {
    it.each([BookingStatus.APPROVED, BookingStatus.REJECTED])(
      'refuses a second decision once %s',
      async (status) => {
        prisma.venueBooking.findUniqueOrThrow.mockResolvedValue(stored(status));

        await expect(service.approve(staff, 'booking-1', {})).rejects.toBeInstanceOf(
          ConflictException,
        );
        expect(prisma.bookingDecision.create).not.toHaveBeenCalled();
      },
    );

    it('re-reads the status under the venue lock, so a double-click is refused', async () => {
      await service.approve(staff, 'booking-1', {});

      expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.venueBooking.findUniqueOrThrow.mock.invocationCallOrder[0],
      );
    });

    it('the transition table only allows a decision from pending', () => {
      expect(canDecide(BookingDecisionKind.DECISION, BookingStatus.REQUESTED, BookingStatus.APPROVED)).toBe(true);
      expect(canDecide(BookingDecisionKind.DECISION, BookingStatus.APPROVED, BookingStatus.REJECTED)).toBe(false);
      expect(canDecide(BookingDecisionKind.REVERSAL, BookingStatus.REQUESTED, BookingStatus.APPROVED)).toBe(false);
    });
  });

  describe('approval keeps the venue free of double-commitment', () => {
    it('refuses to approve over another confirmed booking', async () => {
      prisma.venueBooking.findMany.mockResolvedValue([
        { id: 'other', start: new Date(), end: new Date(), status: BookingStatus.APPROVED, event: { name: 'Gala' } },
      ]);

      await expect(service.approve(staff, 'booking-1', {})).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.bookingDecision.create).not.toHaveBeenCalled();
    });

    it('ignores overlapping pending requests and the booking itself', async () => {
      prisma.venueBooking.findMany.mockResolvedValue([
        { id: 'booking-1', start: new Date(), end: new Date(), status: BookingStatus.APPROVED, event: { name: 'Self' } },
        { id: 'pending', start: new Date(), end: new Date(), status: BookingStatus.REQUESTED, event: { name: 'Other' } },
      ]);

      await expect(service.approve(staff, 'booking-1', {})).resolves.toBeDefined();
    });
  });

  describe('Attendee notice: an approval that replaces the venue notifies registered Attendees', () => {
    let notifier: { notifyRegisteredAttendees: jest.Mock };
    let noticeService: BookingsService;

    const earlier = (venueName: string, approvedAt: string) => ({
      venue: { name: venueName },
      decisions: [{ createdAt: new Date(approvedAt) }],
    });

    /** conflictsFor() reads findMany first; the replacement lookup reads it second. */
    const withReplacements = (rows: unknown[]) =>
      prisma.venueBooking.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce(rows);

    beforeEach(() => {
      notifier = { notifyRegisteredAttendees: jest.fn().mockResolvedValue(0) };
      noticeService = new BookingsService(
        prisma as unknown as PrismaService,
        access as unknown as AccessControlService,
        notifications as unknown as NotificationsService,
        undefined,
        notifier as never,
      );
    });

    it('AC-1/AC-3: names the event and shows the old and the new venue', async () => {
      withReplacements([earlier('Old Hall', '2030-01-01T00:00:00Z')]);

      await noticeService.approve(staff, 'booking-1', {});

      expect(notifier.notifyRegisteredAttendees).toHaveBeenCalledTimes(1);
      expect(notifier.notifyRegisteredAttendees).toHaveBeenCalledWith(
        { id: 'event-1', name: 'Showcase' },
        [{ label: 'Venue', previous: 'Old Hall', next: 'Main Hall' }],
      );
    });

    it('looks only at other venues of this event whose approval was later withdrawn', async () => {
      withReplacements([]);

      await noticeService.approve(staff, 'booking-1', {});

      expect(prisma.venueBooking.findMany.mock.calls[1][0].where).toEqual({
        eventId: 'event-1',
        venueId: { not: 'venue-1' },
        status: BookingStatus.REJECTED,
        decisions: { some: { outcome: BookingStatus.APPROVED } },
      });
    });

    it('AC-5: a further venue approved alongside an approved one replaces nothing', async () => {
      withReplacements([]);

      await noticeService.approve(staff, 'booking-1', {});

      expect(notifier.notifyRegisteredAttendees).not.toHaveBeenCalled();
    });

    it('AC-5: of several replaced venues, the most recently approved one is named', async () => {
      withReplacements([
        earlier('First Hall', '2030-01-01T00:00:00Z'),
        earlier('Second Hall', '2030-03-01T00:00:00Z'),
      ]);

      await noticeService.approve(staff, 'booking-1', {});

      expect(notifier.notifyRegisteredAttendees.mock.calls[0][1]).toEqual([
        { label: 'Venue', previous: 'Second Hall', next: 'Main Hall' },
      ]);
    });

    it('a rejection is not a venue change and does not even look', async () => {
      await noticeService.reject(staff, 'booking-1', { reason: 'Double-booked' });

      expect(notifier.notifyRegisteredAttendees).not.toHaveBeenCalled();
      expect(prisma.venueBooking.findMany).not.toHaveBeenCalled();
    });

    it('never fails the approval if the replacement lookup errors', async () => {
      prisma.venueBooking.findMany
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('db hiccup'));

      await expect(noticeService.approve(staff, 'booking-1', {})).resolves.toMatchObject({
        status: BookingStatus.APPROVED,
      });
      expect(notifier.notifyRegisteredAttendees).not.toHaveBeenCalled();
    });
  });
});
