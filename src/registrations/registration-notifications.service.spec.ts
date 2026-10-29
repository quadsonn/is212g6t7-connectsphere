import { NotificationType } from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegistrationNotificationsService } from './registration-notifications.service';

/** US — opens / closes / near-capacity notices, with Prisma mocked. */
describe('RegistrationNotificationsService', () => {
  const DAY = 24 * 60 * 60 * 1000;

  // Nothing is claimed yet: every stamp reads null.
  const unclaimed = {
    registrationOpenedNotifiedAt: null,
    registrationClosedNotifiedAt: null,
    registrationNearCapacityNotifiedAt: null,
  };

  let tx: {
    $queryRaw: jest.Mock;
    eventRequest: { findUnique: jest.Mock; update: jest.Mock };
    user: { findMany: jest.Mock };
    registration: { findMany: jest.Mock; count: jest.Mock };
    venueBooking: { findMany: jest.Mock };
  };
  let prisma: {
    $transaction: jest.Mock;
    eventRequest: { findMany: jest.Mock };
  };
  let notifications: { notifyMany: jest.Mock };
  let service: RegistrationNotificationsService;

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'EVT-x' }]),
      eventRequest: {
        findUnique: jest.fn().mockResolvedValue({ ...unclaimed }),
        update: jest.fn().mockResolvedValue({}),
      },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      registration: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      venueBooking: { findMany: jest.fn().mockResolvedValue([]) },
    };
    prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      eventRequest: { findMany: jest.fn().mockResolvedValue([]) },
    };
    notifications = { notifyMany: jest.fn().mockResolvedValue(0) };

    service = new RegistrationNotificationsService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });

  describe('notifyOpened', () => {
    it('notifies every attendee who is not registered, once, with the event link', async () => {
      prisma.eventRequest.findMany.mockResolvedValue([{ id: 'EVT-1', name: 'Gala' }]);
      tx.user.findMany.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }]);
      tx.registration.findMany.mockResolvedValue([{ attendeeId: 'a2' }]);

      const result = await service.notifyOpened();

      expect(result).toEqual(['EVT-1']);
      expect(tx.eventRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { registrationOpenedNotifiedAt: expect.any(Date) },
        }),
      );
      const [inputs] = notifications.notifyMany.mock.calls[0];
      expect(inputs.map((i: { recipientId: string }) => i.recipientId).sort()).toEqual(['a1', 'a3']);
      expect(inputs[0]).toMatchObject({
        type: NotificationType.REGISTRATION_OPENED,
        relatedEventId: 'EVT-1',
      });
    });

    it('does nothing when the notice was already claimed', async () => {
      prisma.eventRequest.findMany.mockResolvedValue([{ id: 'EVT-1', name: 'Gala' }]);
      tx.eventRequest.findUnique.mockResolvedValue({
        ...unclaimed,
        registrationOpenedNotifiedAt: new Date(),
      });

      const result = await service.notifyOpened();

      expect(result).toEqual([]);
      expect(tx.eventRequest.update).not.toHaveBeenCalled();
      expect(notifications.notifyMany).not.toHaveBeenCalled();
    });
  });

  describe('notifyClosed', () => {
    const closedEvent = {
      id: 'EVT-2',
      name: 'Closed one',
      proposedStart: new Date(Date.now() + 10 * DAY),
      registrationOpensAt: null,
      registrationClosesAt: new Date(Date.now() - DAY), // closed a day ago
      withdrawalCutoffAt: null,
    };

    it('notifies the registered attendees once the window has closed', async () => {
      prisma.eventRequest.findMany.mockResolvedValue([closedEvent]);
      tx.registration.findMany.mockResolvedValue([{ attendeeId: 'a1' }, { attendeeId: 'a2' }]);

      const result = await service.notifyClosed();

      expect(result).toEqual(['EVT-2']);
      const [inputs] = notifications.notifyMany.mock.calls[0];
      expect(inputs).toHaveLength(2);
      expect(inputs[0]).toMatchObject({
        type: NotificationType.REGISTRATION_CLOSED,
        relatedEventId: 'EVT-2',
      });
    });

    it('does not fire while the window is still open', async () => {
      prisma.eventRequest.findMany.mockResolvedValue([
        { ...closedEvent, registrationClosesAt: new Date(Date.now() + DAY) },
      ]);

      const result = await service.notifyClosed();

      expect(result).toEqual([]);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(notifications.notifyMany).not.toHaveBeenCalled();
    });
  });

  describe('notifyNearCapacity', () => {
    beforeEach(() => {
      prisma.eventRequest.findMany.mockResolvedValue([{ id: 'EVT-3', name: 'Popular' }]);
      tx.registration.findMany.mockResolvedValue([{ attendeeId: 'a1' }]);
    });

    it('notifies registered attendees when 10 or fewer seats remain', async () => {
      tx.venueBooking.findMany.mockResolvedValue([{ venue: { capacity: 100 } }]);
      tx.registration.count.mockResolvedValue(95); // 5 left

      const result = await service.notifyNearCapacity();

      expect(result).toEqual(['EVT-3']);
      expect(tx.eventRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { registrationNearCapacityNotifiedAt: expect.any(Date) },
        }),
      );
      const [inputs] = notifications.notifyMany.mock.calls[0];
      expect(inputs[0]).toMatchObject({
        type: NotificationType.REGISTRATION_NEAR_CAPACITY,
        relatedEventId: 'EVT-3',
      });
      expect(inputs[0].message).toMatch(/5 places left/);
    });

    it('sums capacity across venues and says "full" at zero seats left', async () => {
      tx.venueBooking.findMany.mockResolvedValue([
        { venue: { capacity: 30 } },
        { venue: { capacity: 20 } },
      ]);
      tx.registration.count.mockResolvedValue(50); // full

      const result = await service.notifyNearCapacity();

      expect(result).toEqual(['EVT-3']);
      expect(notifications.notifyMany.mock.calls[0][0][0].message).toMatch(/full/i);
    });

    it('does not fire while more than 10 seats remain', async () => {
      tx.venueBooking.findMany.mockResolvedValue([{ venue: { capacity: 100 } }]);
      tx.registration.count.mockResolvedValue(80); // 20 left

      const result = await service.notifyNearCapacity();

      expect(result).toEqual([]);
      expect(tx.eventRequest.update).not.toHaveBeenCalled();
      expect(notifications.notifyMany).not.toHaveBeenCalled();
    });

    it('does not fire when the venue capacity is unknown', async () => {
      tx.venueBooking.findMany.mockResolvedValue([]); // no approved booking
      tx.registration.count.mockResolvedValue(1000);

      const result = await service.notifyNearCapacity();

      expect(result).toEqual([]);
      expect(notifications.notifyMany).not.toHaveBeenCalled();
    });
  });

  // TC-S4-65, TC-S4-67, TC-S4-69 · US-59 AC-1, AC-3, AC-5 · setup: none (unit) · fails if a notice cannot be worded for an event with no name, or "1 place" and "full" are worded wrongly
  // Code: notifyOpened / notifyClosed / notifyNearCapacity messages (name fallbacks; place / places / full)
  describe('wording', () => {
    const messages = () => notifications.notifyMany.mock.calls.map(([inputs]) => inputs[0].message);
    const unnamed = { id: 'EVT-4', name: null };

    it('words every notice for an event with no name, and says "1 place" or "full"', async () => {
      tx.user.findMany.mockResolvedValue([{ id: 'a9' }]);
      tx.registration.findMany.mockResolvedValue([{ attendeeId: 'a1' }]);
      tx.venueBooking.findMany.mockResolvedValue([{ venue: { capacity: 10 } }]);
      prisma.eventRequest.findMany.mockResolvedValue([
        { ...unnamed, proposedStart: new Date(Date.now() + 10 * DAY), registrationOpensAt: null, registrationClosesAt: new Date(Date.now() - DAY), withdrawalCutoffAt: null },
      ]);

      await service.notifyOpened();
      await service.notifyClosed();
      tx.registration.count.mockResolvedValueOnce(9); // 1 place left
      await service.notifyNearCapacity();
      tx.eventRequest.findUnique.mockResolvedValue({ ...unclaimed });
      tx.registration.count.mockResolvedValueOnce(10); // full
      await service.notifyNearCapacity();

      expect(messages()).toEqual([
        'Registration is now open for "an event".',
        'Registration has closed for "an event".',
        'Only 1 place left for "an event".',
        '"An event" is now full.',
      ]);
    });
  });

  // TC-S4-67, TC-S4-71 · US-59 AC-3, AC-7 · setup: none (unit) · fails if a notice already claimed by another run (found once the row is locked) is sent again
  // Code: claim (stamp set under the lock); notifyNearCapacity (stamp re-read under the lock)
  describe('another run got there first', () => {
    it('sends nothing when the stamp is found set once the row is locked', async () => {
      const claimed = {
        registrationOpenedNotifiedAt: new Date(),
        registrationClosedNotifiedAt: new Date(),
        registrationNearCapacityNotifiedAt: new Date(),
      };
      tx.eventRequest.findUnique.mockResolvedValue(claimed);
      tx.venueBooking.findMany.mockResolvedValue([{ venue: { capacity: 10 } }]);
      tx.registration.count.mockResolvedValue(9);
      prisma.eventRequest.findMany.mockResolvedValue([
        { id: 'EVT-5', name: 'Gala', proposedStart: new Date(Date.now() + 10 * DAY), registrationOpensAt: null, registrationClosesAt: new Date(Date.now() - DAY), withdrawalCutoffAt: null },
      ]);

      await expect(service.notifyClosed()).resolves.toEqual([]);
      await expect(service.notifyNearCapacity()).resolves.toEqual([]);
      expect(notifications.notifyMany).not.toHaveBeenCalled();
    });
  });
});
