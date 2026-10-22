import { NotificationType, Role } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { SafetyCheckNotifier } from './safety-check-notifier.service';

/** US-64 — who is alerted that a safety check is due, and what they are told. */
describe('US-64 SafetyCheckNotifier', () => {
  // 10:00 in Singapore on 13 Nov 2026.
  const event = {
    id: 'event-1',
    name: 'Careers Fair',
    proposedStart: new Date('2026-11-13T02:00:00Z'),
  };

  let prisma: { user: { findMany: jest.Mock } };
  let notifications: { notifySafely: jest.Mock };
  let notifier: SafetyCheckNotifier;

  beforeEach(() => {
    prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'officer-1' }, { id: 'officer-2' }]),
      },
    };
    notifications = { notifySafely: jest.fn().mockResolvedValue(undefined) };
    notifier = new SafetyCheckNotifier(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });

  describe('AC1: every Safety Officer, linked to the event', () => {
    it('Given two Safety Officers, When a check is due, Then each is notified once about that event', async () => {
      const count = await notifier.notifyCheckDue(event);

      expect(count).toBe(2);
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { role: Role.SAFETY_OFFICER },
        select: { id: true },
      });
      expect(notifications.notifySafely.mock.calls.map(([n]) => n)).toEqual([
        expect.objectContaining({
          recipientId: 'officer-1',
          type: NotificationType.SAFETY_CHECK_DUE,
          relatedEventId: 'event-1',
        }),
        expect.objectContaining({
          recipientId: 'officer-2',
          type: NotificationType.SAFETY_CHECK_DUE,
          relatedEventId: 'event-1',
        }),
      ]);
    });

    it('Given no Safety Officers, When a check is due, Then nobody is notified and nothing fails', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await expect(notifier.notifyCheckDue(event)).resolves.toBe(0);
      expect(notifications.notifySafely).not.toHaveBeenCalled();
    });
  });

  describe('AC2: the message has the event name and date', () => {
    it('Given a named, dated event, Then the message is "Safety check due: <name> on <date>"', async () => {
      await notifier.notifyCheckDue(event);

      expect(notifications.notifySafely.mock.calls[0][0].message).toBe(
        'Safety check due: Careers Fair on 13 Nov 2026',
      );
    });

    it('Given a start late in the UTC day, Then the date is the one in Singapore, where the venues are', async () => {
      // 20:00 UTC on 12 Nov is 04:00 on 13 Nov in Singapore.
      await notifier.notifyCheckDue({ ...event, proposedStart: new Date('2026-11-12T20:00:00Z') });

      expect(notifications.notifySafely.mock.calls[0][0].message).toBe(
        'Safety check due: Careers Fair on 13 Nov 2026',
      );
    });

    it('Given an event with no name, Then it still reads as a sentence', async () => {
      await notifier.notifyCheckDue({ ...event, name: null });

      expect(notifications.notifySafely.mock.calls[0][0].message).toBe(
        'Safety check due: Untitled event on 13 Nov 2026',
      );
    });
  });

  describe('best-effort: never fails the status change that triggered it', () => {
    it('Given the officer lookup fails, Then it is swallowed and nobody is notified', async () => {
      prisma.user.findMany.mockRejectedValue(new Error('db down'));

      await expect(notifier.notifyCheckDue(event)).resolves.toBe(0);
      expect(notifications.notifySafely).not.toHaveBeenCalled();
    });
  });
});
