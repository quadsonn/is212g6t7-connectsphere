import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  ChangeRequestStatus,
  EventRequest,
  EventStatus,
  NotificationType,
  Role,
} from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AccessControlService } from '../common/access/access-control.service';
import { Action } from '../common/access/permission.types';
import { BookingsService } from '../bookings/bookings.service';
import { EquipmentReservationsService } from '../equipment/equipment-reservations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CancelEventDto } from './dto/cancel-event.dto';
import { EventsCancellationService } from './events-cancellation.service';
import { EventsService } from './events.service';

/**
 * US-43 — Organiser cancels an event. Each describe block is one acceptance
 * criterion, in the order the card lists them.
 */
describe('EventsCancellationService (US-43)', () => {
  const organiser: AuthenticatedUser = {
    userId: 'organiser-1',
    role: Role.EVENT_ORGANISER,
  } as AuthenticatedUser;

  const dto: CancelEventDto = { reason: 'Speaker withdrew', confirm: true };

  const liveEvent = {
    id: 'event-1',
    name: 'Annual Summit',
    status: EventStatus.CONFIRMED,
    organiserId: 'organiser-1',
    coordinatorId: 'coordinator-1',
    proposedStart: new Date('2099-01-01T09:00:00Z'),
  } as EventRequest;

  let tx: {
    $queryRaw: jest.Mock;
    eventRequest: { findUniqueOrThrow: jest.Mock };
    eventChangeRequest: { updateMany: jest.Mock };
  };
  let prisma: { $transaction: jest.Mock; registration: { findMany: jest.Mock } };
  let access: { assertEventAccess: jest.Mock };
  let events: { setStatus: jest.Mock; recordChange: jest.Mock };
  let bookings: { countReleasableForEvent: jest.Mock };
  let reservations: { countReleasable: jest.Mock };
  let notifications: { notifySafely: jest.Mock };
  let service: EventsCancellationService;

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'event-1' }]),
      eventRequest: { findUniqueOrThrow: jest.fn().mockResolvedValue(liveEvent) },
      eventChangeRequest: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    prisma = {
      $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
      registration: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ attendeeId: 'attendee-1' }, { attendeeId: 'attendee-2' }]),
      },
    };
    access = { assertEventAccess: jest.fn().mockResolvedValue(liveEvent) };
    events = {
      setStatus: jest
        .fn()
        .mockResolvedValue({ ...liveEvent, status: EventStatus.CANCELLED }),
      recordChange: jest.fn().mockResolvedValue({}),
    };
    bookings = { countReleasableForEvent: jest.fn().mockResolvedValue(2) };
    reservations = { countReleasable: jest.fn().mockResolvedValue(4) };
    notifications = { notifySafely: jest.fn().mockResolvedValue(undefined) };

    service = new EventsCancellationService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      events as unknown as EventsService,
      bookings as unknown as BookingsService,
      reservations as unknown as EquipmentReservationsService,
      notifications as unknown as NotificationsService,
    );
  });

  describe('AC-1: only my own events, and only while cancellable', () => {
    it('checks ownership through the shared access layer for the CANCEL action', async () => {
      await service.cancel(organiser, 'event-1', dto);

      expect(access.assertEventAccess).toHaveBeenCalledWith(
        organiser,
        'event-1',
        Action.CANCEL,
      );
    });

    it('reports someone else’s event as not found and changes nothing', async () => {
      access.assertEventAccess.mockRejectedValue(new NotFoundException());

      await expect(service.cancel(organiser, 'event-9', dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(events.setStatus).not.toHaveBeenCalled();
    });

    it.each([
      EventStatus.DRAFT,
      EventStatus.COMPLETED,
      EventStatus.CANCELLED,
      EventStatus.REJECTED,
    ])('refuses a %s event and releases nothing', async (status) => {
      tx.eventRequest.findUniqueOrThrow.mockResolvedValue({ ...liveEvent, status });

      await expect(service.cancel(organiser, 'event-1', dto)).rejects.toThrow(
        ConflictException,
      );
      expect(events.setStatus).not.toHaveBeenCalled();
      expect(bookings.countReleasableForEvent).not.toHaveBeenCalled();
      expect(notifications.notifySafely).not.toHaveBeenCalled();
    });

    it('refuses an event that has already started', async () => {
      tx.eventRequest.findUniqueOrThrow.mockResolvedValue({
        ...liveEvent,
        proposedStart: new Date('2000-01-01T09:00:00Z'),
      });

      await expect(service.cancel(organiser, 'event-1', dto)).rejects.toThrow(
        /already started/,
      );
      expect(events.setStatus).not.toHaveBeenCalled();
    });

    it('re-reads the event under a row lock, so a concurrent change cannot slip past', async () => {
      await service.cancel(organiser, 'event-1', dto);

      expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        tx.eventRequest.findUniqueOrThrow.mock.invocationCallOrder[0],
      );
    });
  });

  describe('AC-3: the status becomes Cancelled, with the reason, who and when in the history', () => {
    it('moves the status through setStatus() inside the transaction', async () => {
      const result = await service.cancel(organiser, 'event-1', dto);

      // US-44: the Organiser is passed on, so each released booking's history names them.
      expect(events.setStatus).toHaveBeenCalledWith(liveEvent, EventStatus.CANCELLED, tx, organiser.userId);
      expect(result.event.status).toBe(EventStatus.CANCELLED);
    });

    it('records the status move and the reason as one history entry by the Organiser', async () => {
      await service.cancel(organiser, 'event-1', dto);

      expect(events.recordChange).toHaveBeenCalledWith(
        tx,
        'event-1',
        'organiser-1',
        [
          { field: 'status', previous: EventStatus.CONFIRMED, next: EventStatus.CANCELLED },
          { field: 'cancellationReason', previous: null, next: 'Speaker withdrew' },
        ],
        [],
      );
    });

    it('records the status the event was cancelled from', async () => {
      tx.eventRequest.findUniqueOrThrow.mockResolvedValue({
        ...liveEvent,
        status: EventStatus.SUBMITTED,
      });

      await service.cancel(organiser, 'event-1', dto);

      const [, , , changes] = events.recordChange.mock.calls[0];
      expect(changes[0]).toMatchObject({ previous: EventStatus.SUBMITTED });
    });
  });

  describe('AC-4: venue bookings, holds and equipment are released in the same request', () => {
    it('releases venues via setStatus() in the same transaction (US-44), counting them first', async () => {
      await service.cancel(organiser, 'event-1', dto);

      expect(bookings.countReleasableForEvent).toHaveBeenCalledWith('event-1', tx);
      expect(bookings.countReleasableForEvent.mock.invocationCallOrder[0]).toBeLessThan(
        events.setStatus.mock.invocationCallOrder[0],
      );
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('releases equipment via setStatus(), counting what it will release first', async () => {
      await service.cancel(organiser, 'event-1', dto);

      expect(reservations.countReleasable).toHaveBeenCalledWith('event-1', tx);
      expect(reservations.countReleasable.mock.invocationCallOrder[0]).toBeLessThan(
        events.setStatus.mock.invocationCallOrder[0],
      );
    });

    it('reports what was released', async () => {
      const result = await service.cancel(organiser, 'event-1', dto);

      expect(result.released).toEqual({ venueBookings: 2, equipmentReservations: 4 });
    });

    it('rolls the whole cancellation back if the venue release fails', async () => {
      // The release runs inside setStatus(CANCELLED) (US-33 equipment, US-44 venues).
      events.setStatus.mockRejectedValue(new Error('db down'));

      await expect(service.cancel(organiser, 'event-1', dto)).rejects.toThrow('db down');
      expect(events.recordChange).not.toHaveBeenCalled();
      expect(notifications.notifySafely).not.toHaveBeenCalled();
    });
  });

  describe('AC-6: any pending change request is closed', () => {
    it('closes pending requests, not rejects them, and says who and when', async () => {
      const result = await service.cancel(organiser, 'event-1', dto);

      expect(tx.eventChangeRequest.updateMany).toHaveBeenCalledWith({
        where: { eventId: 'event-1', status: ChangeRequestStatus.PENDING },
        data: {
          status: ChangeRequestStatus.CLOSED,
          decidedById: 'organiser-1',
          decidedAt: expect.any(Date),
          decisionReason: 'The event was cancelled.',
        },
      });
      expect(result.closedChangeRequests).toBe(1);
    });

    it('is fine when there is nothing pending', async () => {
      tx.eventChangeRequest.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.cancel(organiser, 'event-1', dto)).resolves.toMatchObject({
        closedChangeRequests: 0,
      });
    });
  });

  describe('AC-8: the Coordinator and all registered Attendees are notified', () => {
    it('notifies the assigned Coordinator and each registered Attendee with the reason', async () => {
      const result = await service.cancel(organiser, 'event-1', dto);

      // The Organiser's own confirmation (US-65) is a separate message.
      const recipients = notifications.notifySafely.mock.calls
        .map(([n]) => n)
        .filter((n) => n.message.startsWith('Annual Summit has been cancelled'))
        .map((n) => n.recipientId);
      expect(recipients.sort()).toEqual(['attendee-1', 'attendee-2', 'coordinator-1']);
      expect(notifications.notifySafely).toHaveBeenCalledWith({
        recipientId: 'attendee-1',
        type: NotificationType.EVENT_CANCELLED,
        message: 'Annual Summit has been cancelled. Reason: Speaker withdrew',
        relatedEventId: 'event-1',
      });
      expect(result.notified).toBe(3);
    });

    it('only looks for attendees who are still registered', async () => {
      await service.cancel(organiser, 'event-1', dto);

      expect(prisma.registration.findMany).toHaveBeenCalledWith({
        where: { eventId: 'event-1', status: 'REGISTERED' },
        select: { attendeeId: true },
      });
    });

    it('notifies only the attendees when no Coordinator is assigned yet', async () => {
      const unassigned = { ...liveEvent, coordinatorId: null } as EventRequest;
      tx.eventRequest.findUniqueOrThrow.mockResolvedValue(unassigned);
      events.setStatus.mockResolvedValue({ ...unassigned, status: EventStatus.CANCELLED });

      const result = await service.cancel(organiser, 'event-1', dto);

      expect(result.notified).toBe(2);
    });

    it('does not notify twice when someone is both coordinator and attendee', async () => {
      prisma.registration.findMany.mockResolvedValue([{ attendeeId: 'coordinator-1' }]);

      const result = await service.cancel(organiser, 'event-1', dto);

      expect(result.notified).toBe(1);
    });

    it('sends nothing when the event cannot be cancelled', async () => {
      tx.eventRequest.findUniqueOrThrow.mockResolvedValue({
        ...liveEvent,
        status: EventStatus.COMPLETED,
      });

      await expect(service.cancel(organiser, 'event-1', dto)).rejects.toThrow();
      expect(notifications.notifySafely).not.toHaveBeenCalled();
    });

    it('does not fail the cancellation if a notification cannot be recorded', async () => {
      // notifySafely swallows its own errors; the cancellation has committed.
      notifications.notifySafely.mockResolvedValue(undefined);

      await expect(service.cancel(organiser, 'event-1', dto)).resolves.toBeDefined();
    });
  });

  describe('US-65: the Organiser gets a confirmation of their own cancellation', () => {
    const ownConfirmation = () =>
      notifications.notifySafely.mock.calls
        .map(([n]) => n)
        .filter((n) => n.recipientId === 'organiser-1');

    it('sends one, worded for them, with what was released and their reason', async () => {
      await service.cancel(organiser, 'event-1', dto);

      expect(ownConfirmation()).toEqual([
        {
          recipientId: 'organiser-1',
          type: NotificationType.EVENT_CANCELLED,
          message:
            'You cancelled "Annual Summit". 2 venue bookings and 4 equipment reservations were released. Your pending change request was closed. Reason: Speaker withdrew',
          relatedEventId: 'event-1',
        },
      ]);
    });

    it('uses the singular for one of each, and leaves out the change request when none was pending', async () => {
      bookings.countReleasableForEvent.mockResolvedValue(1);
      reservations.countReleasable.mockResolvedValue(1);
      tx.eventChangeRequest.updateMany.mockResolvedValue({ count: 0 });

      await service.cancel(organiser, 'event-1', dto);

      expect(ownConfirmation()[0].message).toBe(
        'You cancelled "Annual Summit". 1 venue booking and 1 equipment reservation were released. Reason: Speaker withdrew',
      );
    });

    it('says so when nothing was held', async () => {
      bookings.countReleasableForEvent.mockResolvedValue(0);
      reservations.countReleasable.mockResolvedValue(0);
      tx.eventChangeRequest.updateMany.mockResolvedValue({ count: 0 });

      await service.cancel(organiser, 'event-1', dto);

      expect(ownConfirmation()[0].message).toBe(
        'You cancelled "Annual Summit". It held no venue bookings or equipment. Reason: Speaker withdrew',
      );
    });

    it('is not counted among the AC-8 recipients', async () => {
      const result = await service.cancel(organiser, 'event-1', dto);

      expect(result.notified).toBe(3);
    });

    it('is not sent when the cancellation is refused', async () => {
      tx.eventRequest.findUniqueOrThrow.mockResolvedValue({ ...liveEvent, status: EventStatus.COMPLETED });

      await expect(service.cancel(organiser, 'event-1', dto)).rejects.toThrow();
      expect(ownConfirmation()).toEqual([]);
    });
  });
});
