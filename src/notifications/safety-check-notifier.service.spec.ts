import { NotificationType, Role } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import {
  SAFETY_CHECK_REQUESTED_MESSAGE,
  SAFETY_CHECK_RESUBMITTED_MESSAGE,
  SafetyOfficerNotifier,
} from './safety-officer-notifier.service';

/** US-64 — who hears that an event entered the Safety queue, and what they are told. */
describe('US-64 SafetyOfficerNotifier', () => {
  const event = { id: 'event-1' };

  let prisma: { user: { findMany: jest.Mock } };
  let notifications: { notifySafely: jest.Mock };
  let notifier: SafetyOfficerNotifier;

  beforeEach(() => {
    prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'officer-1' }, { id: 'officer-2' }]),
      },
    };
    notifications = { notifySafely: jest.fn().mockResolvedValue(undefined) };
    notifier = new SafetyOfficerNotifier(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });

  describe('every Safety Officer, and nobody else', () => {
    it('asks only for users holding the Safety Officer role', async () => {
      await notifier.notifySafetyCheckDue(event, { resubmitted: false });

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { role: Role.SAFETY_OFFICER },
        select: { id: true },
      });
    });

    it('notifies each of them, once', async () => {
      const count = await notifier.notifySafetyCheckDue(event, { resubmitted: false });

      expect(count).toBe(2);
      expect(notifications.notifySafely.mock.calls.map(([n]) => n.recipientId)).toEqual([
        'officer-1',
        'officer-2',
      ]);
    });

    it('notifies nobody, and does not fail, when there is no Safety Officer', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await expect(notifier.notifySafetyCheckDue(event, { resubmitted: false })).resolves.toBe(0);
      expect(notifications.notifySafely).not.toHaveBeenCalled();
    });
  });

  describe('typed and linked to the event', () => {
    it('a confirmation says the arrangements are ready', async () => {
      await notifier.notifySafetyCheckDue(event, { resubmitted: false });

      expect(notifications.notifySafely).toHaveBeenCalledWith({
        recipientId: 'officer-1',
        type: NotificationType.SAFETY_CHECK_REQUESTED,
        message: SAFETY_CHECK_REQUESTED_MESSAGE,
        relatedEventId: 'event-1',
      });
    });

    it('a resubmission says it was sent back after changes', async () => {
      await notifier.notifySafetyCheckDue(event, { resubmitted: true });

      expect(notifications.notifySafely).toHaveBeenCalledWith({
        recipientId: 'officer-1',
        type: NotificationType.SAFETY_CHECK_REQUESTED,
        message: SAFETY_CHECK_RESUBMITTED_MESSAGE,
        relatedEventId: 'event-1',
      });
    });
  });

  describe('best-effort: never fails the status change that triggered it', () => {
    it('swallows a lookup failure and reports zero', async () => {
      prisma.user.findMany.mockRejectedValue(new Error('db down'));

      await expect(notifier.notifySafetyCheckDue(event, { resubmitted: false })).resolves.toBe(0);
      expect(notifications.notifySafely).not.toHaveBeenCalled();
    });
  });
});
