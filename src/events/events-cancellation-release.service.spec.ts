import { ConflictException } from '@nestjs/common';
import { EventRequest, EventStatus } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { EquipmentReservationsService } from '../equipment/equipment-reservations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from './events.service';

/**
 * US-33 AC-1 — EventsService.setStatus() releases equipment when an event
 * becomes CANCELLED, atomically with the status change. No cancel endpoint is
 * built here (#43); this is the reaction any cancellation path will trigger.
 */
describe('EventsService.setStatus → equipment release (US-33)', () => {
  let tx: { eventRequest: { update: jest.Mock } };
  let prisma: { $transaction: jest.Mock; eventRequest: { update: jest.Mock } };
  let reservations: { releaseForCancelledEvent: jest.Mock };
  let service: EventsService;

  const event = { id: 'event-1', status: EventStatus.PLANNING } as EventRequest;

  beforeEach(() => {
    tx = {
      eventRequest: {
        update: jest.fn().mockResolvedValue({ ...event, status: EventStatus.CANCELLED }),
      },
    };
    prisma = {
      $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
      eventRequest: {
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...event, ...data })),
      },
    };
    reservations = { releaseForCancelledEvent: jest.fn().mockResolvedValue(1) };

    service = new EventsService(
      prisma as unknown as PrismaService,
      {} as AccessControlService,
      {} as NotificationsService,
      reservations as unknown as EquipmentReservationsService,
    );
  });

  describe('US-33 AC-1: status changing to cancelled releases the event’s reservations', () => {
    it('writes CANCELLED and releases, both inside one transaction', async () => {
      const result = await service.setStatus(event, EventStatus.CANCELLED);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.eventRequest.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { status: EventStatus.CANCELLED },
      });
      expect(reservations.releaseForCancelledEvent).toHaveBeenCalledWith('event-1', tx);
      expect(result.status).toBe(EventStatus.CANCELLED);
      expect(prisma.eventRequest.update).not.toHaveBeenCalled();
    });

    it('releases after the status write, so the release sees CANCELLED', async () => {
      await service.setStatus(event, EventStatus.CANCELLED);

      expect(tx.eventRequest.update.mock.invocationCallOrder[0]).toBeLessThan(
        reservations.releaseForCancelledEvent.mock.invocationCallOrder[0],
      );
    });

    it('joins the caller’s transaction when one is supplied', async () => {
      await service.setStatus(event, EventStatus.CANCELLED, tx as never);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(reservations.releaseForCancelledEvent).toHaveBeenCalledWith('event-1', tx);
    });

    it('propagates a release failure so the cancellation rolls back with it', async () => {
      reservations.releaseForCancelledEvent.mockRejectedValue(new Error('db down'));

      await expect(service.setStatus(event, EventStatus.CANCELLED)).rejects.toThrow('db down');
    });

    it.each([EventStatus.AWAITING_ARRANGEMENTS, EventStatus.CONFIRMED])(
      'releases nothing on a change to %s',
      async (next) => {
        await service.setStatus(event, next);

        expect(reservations.releaseForCancelledEvent).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
      },
    );
  });

  describe('US-33 AC-4: an already-cancelled event is not released again', () => {
    it('treats CANCELLED → CANCELLED as a no-op, releasing nothing', async () => {
      const cancelled = { ...event, status: EventStatus.CANCELLED };

      await expect(service.setStatus(cancelled, EventStatus.CANCELLED)).resolves.toBe(cancelled);
      expect(reservations.releaseForCancelledEvent).not.toHaveBeenCalled();
    });

    it('does not release when the transition to CANCELLED is illegal', async () => {
      const completed = { ...event, status: EventStatus.COMPLETED };

      await expect(service.setStatus(completed, EventStatus.CANCELLED)).rejects.toThrow(
        ConflictException,
      );
      expect(reservations.releaseForCancelledEvent).not.toHaveBeenCalled();
    });
  });
});
