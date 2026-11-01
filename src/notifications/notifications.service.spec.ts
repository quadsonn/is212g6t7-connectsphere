import { NotificationType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

/** US-09 AC-4 — the E9 integration point. */
describe('NotificationsService', () => {
  let prisma: { notification: { create: jest.Mock } };
  let service: NotificationsService;

  beforeEach(() => {
    prisma = { notification: { create: jest.fn().mockResolvedValue({}) } };
    service = new NotificationsService(prisma as unknown as PrismaService);
  });

  it('records a notification against the recipient and event', async () => {
    await service.notify({
      recipientId: 'user-1',
      type: NotificationType.CLARIFICATION_REQUESTED,
      message: 'A question is waiting',
      relatedEventId: 'event-1',
    });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        recipientId: 'user-1',
        type: NotificationType.CLARIFICATION_REQUESTED,
        message: 'A question is waiting',
        relatedEventId: 'event-1',
        relatedBookingId: null,
      },
    });
  });

  it('defaults relatedEventId to null when absent', async () => {
    await service.notify({
      recipientId: 'user-1',
      type: NotificationType.EVENT_STATUS_CHANGED,
      message: 'Status changed',
    });

    expect(prisma.notification.create.mock.calls[0][0].data.relatedEventId).toBeNull();
  });

  it('participates in a caller’s transaction when one is given', async () => {
    const tx = { notification: { create: jest.fn().mockResolvedValue({}) } };

    await service.notify(
      {
        recipientId: 'user-1',
        type: NotificationType.CLARIFICATION_ANSWERED,
        message: 'Answered',
      },
      tx as never,
    );

    expect(tx.notification.create).toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  describe('notifySafely', () => {
    it('swallows a failure so the caller’s action survives', async () => {
      prisma.notification.create.mockRejectedValue(new Error('database down'));

      await expect(
        service.notifySafely({
          recipientId: 'user-1',
          type: NotificationType.CLARIFICATION_REQUESTED,
          message: 'A question is waiting',
        }),
      ).resolves.toBeUndefined();
    });

    it('still records the notification on the happy path', async () => {
      await service.notifySafely({
        recipientId: 'user-1',
        type: NotificationType.CLARIFICATION_REQUESTED,
        message: 'A question is waiting',
      });

      expect(prisma.notification.create).toHaveBeenCalled();
    });
  });

  // TC-S3-59 · US-40 AC-3 · setup: none (unit) · fails if an equipment notice loses the item it names, or other notices gain an empty one
  // Code: NotificationsService.notify (relatedEquipmentId only when given)
  it('US-60: records the equipment item only when one is named', async () => {
    await service.notify({ recipientId: 'u1', type: NotificationType.EQUIPMENT_STATUS_CHANGED, message: 'm', relatedEquipmentId: 'EQP-1' });
    await service.notify({ recipientId: 'u1', type: NotificationType.EQUIPMENT_STATUS_CHANGED, message: 'm' });

    expect(prisma.notification.create.mock.calls[0][0].data.relatedEquipmentId).toBe('EQP-1');
    expect(prisma.notification.create.mock.calls[1][0].data).not.toHaveProperty('relatedEquipmentId');
  });

  // TC-S3-62 · US-40 AC-6 · setup: none (unit) · fails if an empty batch writes anything, or a batch notice with no event or booking is not stored as none
  // Code: NotificationsService.notifyMany (empty list; relatedEventId/relatedBookingId ?? null)
  describe('notifyMany', () => {
    it('writes nothing for an empty list, and stores missing links as none', async () => {
      const createMany = jest.fn().mockResolvedValue({ count: 1 });
      const batch = new NotificationsService({ notification: { createMany } } as unknown as PrismaService);

      await expect(batch.notifyMany([])).resolves.toBe(0);
      expect(createMany).not.toHaveBeenCalled();

      await expect(batch.notifyMany([{ recipientId: 'u1', type: NotificationType.SAFETY_CHECK_DUE, message: 'm' }])).resolves.toBe(1);
      expect(createMany.mock.calls[0][0].data[0]).toMatchObject({ relatedEventId: null, relatedBookingId: null });
    });
  });
});
