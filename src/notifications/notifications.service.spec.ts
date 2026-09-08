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
});
