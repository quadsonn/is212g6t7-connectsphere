import { NotificationType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AttendeeChangeNotifier } from './attendee-change-notifier.service';
import { NotificationsService } from './notifications.service';

/** Who an event's schedule-change notice goes to. */
describe('AttendeeChangeNotifier', () => {
  const event = { id: 'event-1', name: 'Annual Summit' };
  const change = { label: 'Venue' as const, previous: 'Hall A', next: 'Hall B' };

  let prisma: { registration: { findMany: jest.Mock } };
  let notifications: { notifySafely: jest.Mock };
  let notifier: AttendeeChangeNotifier;

  beforeEach(() => {
    prisma = {
      registration: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ attendeeId: 'attendee-1' }, { attendeeId: 'attendee-2' }]),
      },
    };
    notifications = { notifySafely: jest.fn().mockResolvedValue(undefined) };
    notifier = new AttendeeChangeNotifier(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });

  describe('AC-2: every registered Attendee, and no withdrawn registration', () => {
    it('asks only for registrations that are REGISTERED', async () => {
      await notifier.notifyRegisteredAttendees(event, [change]);

      expect(prisma.registration.findMany).toHaveBeenCalledWith({
        where: { eventId: 'event-1', status: 'REGISTERED' },
        select: { attendeeId: true },
      });
    });

    it('notifies each of them, once', async () => {
      const count = await notifier.notifyRegisteredAttendees(event, [change]);

      expect(count).toBe(2);
      expect(notifications.notifySafely.mock.calls.map(([n]) => n.recipientId)).toEqual([
        'attendee-1',
        'attendee-2',
      ]);
    });

    it('notifies nobody when nobody is registered', async () => {
      prisma.registration.findMany.mockResolvedValue([]);

      await expect(notifier.notifyRegisteredAttendees(event, [change])).resolves.toBe(0);
      expect(notifications.notifySafely).not.toHaveBeenCalled();
    });
  });

  describe('AC-1 / AC-3 / AC-4: one notification per Attendee carrying every change', () => {
    it('sends one message, typed and linked to the event, listing all fields', async () => {
      await notifier.notifyRegisteredAttendees(event, [
        { label: 'Start', previous: '1 Oct 2030, 09:00', next: '2 Oct 2030, 09:00' },
        change,
      ]);

      expect(notifications.notifySafely).toHaveBeenCalledTimes(2);
      expect(notifications.notifySafely).toHaveBeenCalledWith({
        recipientId: 'attendee-1',
        type: NotificationType.EVENT_SCHEDULE_CHANGED,
        message:
          '"Annual Summit" has changed. Start: 1 Oct 2030, 09:00 → 2 Oct 2030, 09:00; Venue: Hall A → Hall B.',
        relatedEventId: 'event-1',
      });
    });
  });

  describe('AC-6: nothing to report, nothing sent', () => {
    it('does not even look up Attendees for an empty change list', async () => {
      await expect(notifier.notifyRegisteredAttendees(event, [])).resolves.toBe(0);

      expect(prisma.registration.findMany).not.toHaveBeenCalled();
      expect(notifications.notifySafely).not.toHaveBeenCalled();
    });
  });

  describe('best-effort: never fails the change that triggered it', () => {
    it('swallows a lookup failure and reports zero', async () => {
      prisma.registration.findMany.mockRejectedValue(new Error('db down'));

      await expect(notifier.notifyRegisteredAttendees(event, [change])).resolves.toBe(0);
      expect(notifications.notifySafely).not.toHaveBeenCalled();
    });

    // TC-S3-46 · US-38 AC-7 · setup: none (unit) · fails if a failure that is not an Error object escapes or breaks the change
    // Code: AttendeeChangeNotifier.notifyRegisteredAttendees (logs String(error) for a non-Error)
    it('also swallows a failure that is not an Error object', async () => {
      prisma.registration.findMany.mockRejectedValue('connection reset');

      await expect(notifier.notifyRegisteredAttendees(event, [change])).resolves.toBe(0);
    });
  });
});
