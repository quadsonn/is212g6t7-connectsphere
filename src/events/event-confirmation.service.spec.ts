import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import {
  BookingStatus,
  EventRequest,
  EventStatus,
  NotificationType,
  Role,
  SafetyOutcome,
} from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AccessControlService } from '../common/access/access-control.service';
import { EquipmentReservationsService } from '../equipment/equipment-reservations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SafetyCheckNotifier } from '../notifications/safety-check-notifier.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventConfirmationService } from './event-confirmation.service';
import { EventsService } from './events.service';
import { BookingsService } from '../bookings/bookings.service';

const coordinator: AuthenticatedUser = {
  userId: 'coord-1',
  role: Role.EVENT_COORDINATOR,
} as AuthenticatedUser;

const event = {
  id: 'event-1',
  name: 'Showcase',
  status: EventStatus.PLANNING,
  organiserId: 'org-1',
  coordinatorId: 'coord-1',
} as EventRequest;

describe('US-42 EventsService.setStatus records who confirmed', () => {
  const build = () => {
    const update = jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...event, ...data }));
    const prisma = { eventRequest: { update } };
    const service = new EventsService(
      prisma as unknown as PrismaService,
      {} as AccessControlService,
      {} as NotificationsService,
      {} as EquipmentReservationsService,
      { releaseForCancelledEvent: jest.fn().mockResolvedValue([]) } as unknown as BookingsService,
    );
    return { service, update };
  };

  it('US-42 AC-4: a move to AWAITING_SAFETY_CHECK records the actor and the time', async () => {
    const { service, update } = build();

    const result = await service.setStatus(event, EventStatus.AWAITING_SAFETY_CHECK, undefined, 'coord-1');

    expect(update).toHaveBeenNthCalledWith(1, {
      where: { id: 'event-1' },
      // Requirement change 6: the Safety queue lists longest-waiting first.
      data: { status: EventStatus.AWAITING_SAFETY_CHECK, safetyQueuedAt: expect.any(Date) },
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      where: { id: 'event-1' },
      data: { arrangementsConfirmedAt: expect.any(Date), arrangementsConfirmedById: 'coord-1' },
    });
    expect(result.arrangementsConfirmedById).toBe('coord-1');
  });

  it('US-42: other transitions record no confirmation', async () => {
    const { service, update } = build();

    await service.setStatus(event, EventStatus.AWAITING_ARRANGEMENTS, undefined, 'coord-1');

    expect(update).toHaveBeenCalledTimes(1);
  });

  it('US-42: PLANNING can no longer jump straight to CONFIRMED', async () => {
    const { service } = build();

    await expect(service.setStatus(event, EventStatus.CONFIRMED)).rejects.toThrow(ConflictException);
  });
});

describe('US-42 EventConfirmationService', () => {
  const build = (bookings: { status: BookingStatus; needsReview: boolean }[]) => {
    const tx = {
      $executeRaw: jest.fn(),
      venueBooking: {
        findMany: jest
          .fn()
          .mockImplementation(({ distinct }) =>
            Promise.resolve(
              distinct
                ? [{ venueId: 'v2' }, { venueId: 'v1' }]
                : bookings.map((b) => ({ ...b, venue: { name: 'Hall A' } })),
            ),
          ),
      },
      equipmentRequirement: { findMany: jest.fn().mockResolvedValue([]) },
      equipmentReservation: { findMany: jest.fn().mockResolvedValue([]) },
      eventRequest: { findUniqueOrThrow: jest.fn().mockResolvedValue(event) },
      // No safety feedback waiting for an answer.
      safetyReview: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const prisma = {
      ...tx,
      $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
      equipmentRequirement: { findFirst: jest.fn(), update: jest.fn() },
    };
    const access = {
      assertEventAccess: jest.fn().mockResolvedValue(event),
      isAssignedCoordinator: jest.fn().mockReturnValue(true),
    };
    const events = {
      setStatus: jest
        .fn()
        .mockResolvedValue({ ...event, status: EventStatus.AWAITING_SAFETY_CHECK }),
    };
    const notifications = { notifySafely: jest.fn() };
    const safetyChecks = { notifyCheckDue: jest.fn().mockResolvedValue(1) };
    const service = new EventConfirmationService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      events as unknown as EventsService,
      notifications as unknown as NotificationsService,
      safetyChecks as unknown as SafetyCheckNotifier,
    );
    return { service, prisma, tx, access, events, notifications, safetyChecks };
  };

  it('US-42 AC-4: locks the venues in sorted order, then confirms through setStatus', async () => {
    const { service, tx, events } = build([{ status: BookingStatus.APPROVED, needsReview: false }]);

    await service.confirm(coordinator, 'event-1');

    const locked = tx.$executeRaw.mock.calls.map((call) => call[1]);
    expect(locked).toEqual(['v1', 'v2']);
    expect(events.setStatus).toHaveBeenCalledWith(
      event,
      EventStatus.AWAITING_SAFETY_CHECK,
      tx,
      'coord-1',
    );
  });

  it('US-42 AC-5: notifies the Organiser after confirming', async () => {
    const { service, notifications } = build([{ status: BookingStatus.APPROVED, needsReview: false }]);

    await service.confirm(coordinator, 'event-1');

    expect(notifications.notifySafely).toHaveBeenCalledWith({
      recipientId: 'org-1',
      type: NotificationType.EVENT_STATUS_CHANGED,
      message: '"Showcase": Arrangements confirmed - awaiting safety review.',
      relatedEventId: 'event-1',
    });
  });

  it('US-64 AC1: Given ready arrangements, When the Coordinator confirms, Then every Safety Officer is alerted about the event', async () => {
    const { service, safetyChecks } = build([{ status: BookingStatus.APPROVED, needsReview: false }]);

    await service.confirm(coordinator, 'event-1');

    expect(safetyChecks.notifyCheckDue).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'event-1', status: EventStatus.AWAITING_SAFETY_CHECK }),
    );
  });

  it('US-42 / US-64: Given arrangements not ready, When the Coordinator confirms, Then 409, no status change, no alert', async () => {
    const { service, events, notifications, safetyChecks } = build([
      { status: BookingStatus.REQUESTED, needsReview: false },
    ]);

    await expect(service.confirm(coordinator, 'event-1')).rejects.toThrow(ConflictException);
    expect(events.setStatus).not.toHaveBeenCalled();
    expect(notifications.notifySafely).not.toHaveBeenCalled();
    expect(safetyChecks.notifyCheckDue).not.toHaveBeenCalled();
  });

  it('US-64: Given the confirmation transaction rolls back, Then no Safety Officer is alerted', async () => {
    const { service, events, safetyChecks } = build([{ status: BookingStatus.APPROVED, needsReview: false }]);
    events.setStatus.mockRejectedValue(new Error('write failed; transaction rolled back'));

    await expect(service.confirm(coordinator, 'event-1')).rejects.toThrow('rolled back');
    expect(safetyChecks.notifyCheckDue).not.toHaveBeenCalled();
  });

  it('US-42 AC-3: a Coordinator not assigned to the event gets 403', async () => {
    const { service, access, prisma } = build([]);
    access.isAssignedCoordinator.mockReturnValue(false);

    await expect(service.confirm(coordinator, 'event-1')).rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('US-42: a catalogue-linked line cannot be ticked by hand (400)', async () => {
    const { service, prisma } = build([]);
    prisma.equipmentRequirement.findFirst.mockResolvedValue({ id: 'r1', equipmentId: 'eq-1' });

    await expect(service.manualConfirm(coordinator, 'event-1', 'r1')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.equipmentRequirement.update).not.toHaveBeenCalled();
  });

  // TC-S3-73 · US-42 AC-4 · setup: none (unit) · fails if Confirm bypasses unanswered safety feedback, or blocks an event whose feedback was answered
  // Code: EventConfirmationService.confirm (latest safety review not yet resubmitted)
  it('US-42 / US-57: refuses Confirm while safety feedback waits for an answer, and allows it once answered', async () => {
    const waiting = build([{ status: BookingStatus.APPROVED, needsReview: false }]);
    waiting.tx.safetyReview.findFirst.mockResolvedValue({ outcome: SafetyOutcome.CHANGES_REQUESTED, resubmittedAt: null });

    await expect(waiting.service.confirm(coordinator, 'event-1')).rejects.toThrow(
      'this event has safety feedback waiting for an answer; send it back for a safety check instead',
    );
    expect(waiting.events.setStatus).not.toHaveBeenCalled();

    const answered = build([{ status: BookingStatus.APPROVED, needsReview: false }]);
    answered.tx.safetyReview.findFirst.mockResolvedValue({ outcome: SafetyOutcome.REJECTED, resubmittedAt: new Date() });

    await answered.service.confirm(coordinator, 'event-1');
    expect(answered.events.setStatus).toHaveBeenCalled();
  });

  // TC-S3-71, TC-S3-74 · US-42 AC-2, AC-5 · setup: none (unit) · fails if a nameless venue or event breaks the checklist or the Organiser's notice
  // Code: EventConfirmationService.loadFacts (venue name fallback), confirm (event name fallback)
  it('US-42: words the checklist and the notice for a nameless venue and event', async () => {
    const { service, tx, events, notifications } = build([{ status: BookingStatus.REQUESTED, needsReview: false }]);
    tx.venueBooking.findMany.mockImplementation(({ distinct }) =>
      Promise.resolve(distinct ? [] : [{ status: BookingStatus.REQUESTED, needsReview: false, venue: { name: null } }]),
    );

    const readiness = await service.getConfirmationReadiness('event-1', tx as never);
    expect(readiness.items[0].label).toBe('Venue booking at an unnamed venue still pending');

    tx.venueBooking.findMany.mockResolvedValue([]);
    events.setStatus.mockResolvedValue({ ...event, name: null, status: EventStatus.AWAITING_SAFETY_CHECK });
    jest.spyOn(service, 'getConfirmationReadiness').mockResolvedValue({ ready: true, items: [] } as never);
    await service.confirm(coordinator, 'event-1');
    expect(notifications.notifySafely).toHaveBeenCalledWith(
      expect.objectContaining({ message: '"Your event": Arrangements confirmed - awaiting safety review.' }),
    );
  });
});
