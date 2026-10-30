import { EquipmentStatus, EventStatus, NotificationType, Prisma, Role } from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { EquipmentNotifier } from './equipment-notifier';

/** US — equipment unavailable / released notices to the Coordinator. */
describe('EquipmentNotifier', () => {
  let tx: { user: { findMany: jest.Mock } };
  let notifications: { notify: jest.Mock };
  let notifier: EquipmentNotifier;

  const run = () => tx as unknown as Prisma.TransactionClient;
  const recipients = () =>
    notifications.notify.mock.calls.map((call) => call[0].recipientId);

  beforeEach(() => {
    tx = { user: { findMany: jest.fn().mockResolvedValue([]) } };
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };
    notifier = new EquipmentNotifier(notifications as unknown as NotificationsService);
  });

  describe('unavailable (AC-1)', () => {
    it('notifies each affected event’s coordinator once, naming event, item and reason', async () => {
      await notifier.unavailable(
        run(),
        { type: 'Laser projector', status: EquipmentStatus.OUT_OF_SERVICE, reason: 'Cracked lens' },
        [
          { id: 'EVT-1', name: 'Gala', coordinatorId: 'USR-c1' },
          { id: 'EVT-1', name: 'Gala', coordinatorId: 'USR-c1' }, // same event again
          { id: 'EVT-2', name: 'Expo', coordinatorId: 'USR-c2' },
        ],
      );

      expect(notifications.notify).toHaveBeenCalledTimes(2); // one per event
      const [first] = notifications.notify.mock.calls[0];
      expect(first).toMatchObject({
        recipientId: 'USR-c1',
        type: NotificationType.EQUIPMENT_UNAVAILABLE,
        relatedEventId: 'EVT-1',
      });
      expect(first.message).toContain('Laser projector');
      expect(first.message).toContain('Gala');
      expect(first.message).toContain('Reason: Cracked lens');
    });

    // TC-S4-109 · US-67 AC-3 · setup: none (unit) · fails if the Leads are not told when the event has no Coordinator
    // Code: EquipmentNotifier.toCoordinator (Coordinator, else every Lead, else skip and log)
    it('falls back to every Coordinator Lead when the event is unassigned', async () => {
      tx.user.findMany.mockResolvedValue([{ id: 'USR-l1' }, { id: 'USR-l2' }]);

      await notifier.unavailable(
        run(),
        { type: 'Mic', status: EquipmentStatus.UNDER_MAINTENANCE, reason: 'x' },
        [{ id: 'EVT-9', name: 'E', coordinatorId: null }],
      );

      expect(tx.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { role: Role.EVENT_COORDINATOR_LEAD } }),
      );
      expect(recipients()).toEqual(['USR-l1', 'USR-l2']);
    });

    // TC-S4-109 · US-67 AC-3 · setup: none (unit) · fails if an event with neither a Coordinator nor a Lead throws
    // Code: EquipmentNotifier.toCoordinator (Coordinator, else every Lead, else skip and log)
    it('skips without throwing when there is no coordinator and no lead', async () => {
      tx.user.findMany.mockResolvedValue([]);

      await expect(
        notifier.unavailable(
          run(),
          { type: 'Mic', status: EquipmentStatus.UNDER_MAINTENANCE, reason: 'x' },
          [{ id: 'EVT-9', name: 'E', coordinatorId: null }],
        ),
      ).resolves.toBeUndefined();
      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });

  describe('released (AC-2)', () => {
    it('tells the coordinator, worded for a cancellation', async () => {
      await notifier.released(run(), {
        id: 'EVT-1',
        name: 'Gala',
        coordinatorId: 'USR-c1',
        status: EventStatus.CANCELLED,
      });

      const [input] = notifications.notify.mock.calls[0];
      expect(input).toMatchObject({
        recipientId: 'USR-c1',
        type: NotificationType.EQUIPMENT_RELEASED,
        relatedEventId: 'EVT-1',
      });
      expect(input.message).toContain('Gala');
      expect(input.message).toContain('cancelled');
    });

    it('words it as unfulfillable when the event was rejected', async () => {
      await notifier.released(run(), {
        id: 'EVT-1',
        name: 'Gala',
        coordinatorId: 'USR-c1',
        status: EventStatus.REJECTED,
      });
      expect(notifications.notify.mock.calls[0][0].message).toContain('unfulfillable');
    });
  });

  // TC-S4-107, TC-S4-108 · US-67 AC-1, AC-2 · setup: none (unit) · fails if a notice cannot be worded for an event with no name
  // Code: EquipmentNotifier.unavailable / released (name fallback)
  it('words every notice for an event with no name as "an event"', async () => {
    const event = { id: 'EVT-1', name: null, coordinatorId: 'USR-c1' };

    await notifier.unavailable(run(), { type: 'Mic A', status: EquipmentStatus.OUT_OF_SERVICE, reason: 'x' }, [event]);
    await notifier.released(run(), { ...event, status: EventStatus.CANCELLED });

    for (const [{ message }] of notifications.notify.mock.calls) {
      expect(message).toContain('"an event"');
    }
    expect(notifications.notify).toHaveBeenCalledTimes(2);
  });
});
