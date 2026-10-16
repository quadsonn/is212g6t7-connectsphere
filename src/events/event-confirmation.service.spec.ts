import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import {
  BookingStatus,
  EventRequest,
  EventStatus,
  NotificationType,
  Role,
} from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AccessControlService } from '../common/access/access-control.service';
import { EquipmentReservationsService } from '../equipment/equipment-reservations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventConfirmationService } from './event-confirmation.service';
import { EventsService } from './events.service';
import { VenueActivityNotifier } from '../bookings/venue-activity-notifier';

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
      { requestSubmitted: jest.fn(), approvedBookingChanged: jest.fn(), eventCancelled: jest.fn() } as unknown as VenueActivityNotifier,
    );
    return { service, update };
  };

  it('US-42 AC-4: a move to AWAITING_SAFETY_CHECK records the actor and the time', async () => {
    const { service, update } = build();

    const result = await service.setStatus(event, EventStatus.AWAITING_SAFETY_CHECK, undefined, 'coord-1');

    expect(update).toHaveBeenNthCalledWith(1, {
      where: { id: 'event-1' },
      data: { status: EventStatus.AWAITING_SAFETY_CHECK },
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
    const service = new EventConfirmationService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      events as unknown as EventsService,
      notifications as unknown as NotificationsService,
    );
    return { service, prisma, tx, access, events, notifications };
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

  it('US-42: not ready inside the transaction -> 409, no status change, no notification', async () => {
    const { service, events, notifications } = build([
      { status: BookingStatus.REQUESTED, needsReview: false },
    ]);

    await expect(service.confirm(coordinator, 'event-1')).rejects.toThrow(ConflictException);
    expect(events.setStatus).not.toHaveBeenCalled();
    expect(notifications.notifySafely).not.toHaveBeenCalled();
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
});
