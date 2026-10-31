import { EventStatus, NotificationType, Prisma } from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TechnicalSupportNotifier } from './technical-support-notifier';

/** US-66 — who hears about equipment work for an event, and what they are told. */
describe('TechnicalSupportNotifier (US-66)', () => {
  let tx: { eventRequest: { findUniqueOrThrow: jest.Mock } };
  let prisma: { eventRequest: { findUnique: jest.Mock }; user: { findMany: jest.Mock } };
  let notifications: { notify: jest.Mock; notifySafely: jest.Mock };
  let notifier: TechnicalSupportNotifier;

  const OLD = { start: new Date('2030-10-01T10:00:00Z'), end: new Date('2030-10-01T12:00:00Z') };
  const NEW = { start: new Date('2030-10-02T10:00:00Z'), end: new Date('2030-10-02T12:00:00Z') };

  beforeEach(() => {
    tx = { eventRequest: { findUniqueOrThrow: jest.fn() } };
    prisma = {
      eventRequest: { findUnique: jest.fn() },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'USR-010' }, { id: 'USR-011' }]) },
    };
    notifications = {
      notify: jest.fn().mockResolvedValue(undefined),
      notifySafely: jest.fn().mockResolvedValue(undefined),
    };
    notifier = new TechnicalSupportNotifier(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });

  const client = () => tx as unknown as Prisma.TransactionClient;
  const projectors = [{ quantity: 2, equipmentType: 'Projector' }];

  describe('AC-1: cancelled or rejected', () => {
    it('US-66 AC-1: tells the assignee what was released, in the releasing transaction', async () => {
      tx.eventRequest.findUniqueOrThrow.mockResolvedValue({
        status: EventStatus.CANCELLED,
        technicalSupportId: 'USR-010',
      });

      await notifier.reservationsReleased(client(), 'EVT-001', projectors);

      expect(notifications.notify).toHaveBeenCalledWith(
        {
          recipientId: 'USR-010',
          type: NotificationType.EQUIPMENT_EVENT_CANCELLED,
          message: 'Event cancelled. Released: 2 × Projector.',
          relatedEventId: 'EVT-001',
        },
        tx,
      );
    });

    it('US-66 AC-1: a rejection says so', async () => {
      tx.eventRequest.findUniqueOrThrow.mockResolvedValue({
        status: EventStatus.REJECTED,
        technicalSupportId: 'USR-010',
      });

      await notifier.reservationsReleased(client(), 'EVT-001', projectors);

      expect(notifications.notify.mock.calls[0][0].message).toBe(
        'Event rejected as unfulfillable. Released: 2 × Projector.',
      );
    });

    it('US-66 AC-1: nothing released, nothing sent (no live reservations)', async () => {
      await notifier.reservationsReleased(client(), 'EVT-001', []);

      expect(tx.eventRequest.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('US-66 AC-1: nobody assigned, nothing sent', async () => {
      tx.eventRequest.findUniqueOrThrow.mockResolvedValue({
        status: EventStatus.CANCELLED,
        technicalSupportId: null,
      });

      await notifier.reservationsReleased(client(), 'EVT-001', projectors);

      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });

  describe('AC-2: rebooked for a new time', () => {
    it('US-66 AC-2: tells the assignee the old and new time and what moved', async () => {
      tx.eventRequest.findUniqueOrThrow.mockResolvedValue({ technicalSupportId: 'USR-010' });

      await notifier.reservationsRebooked(client(), 'EVT-001', [{ ...projectors[0], from: OLD, to: NEW }]);

      const [input, passedTx] = notifications.notify.mock.calls[0];
      expect(passedTx).toBe(tx);
      expect(input).toMatchObject({
        recipientId: 'USR-010',
        type: NotificationType.EQUIPMENT_RESERVATIONS_REBOOKED,
        relatedEventId: 'EVT-001',
      });
      expect(input.message).toMatch(/^Time .*10:00–12:00 UTC → .*10:00–12:00 UTC\. Rebooked: 2 × Projector\./);
    });

    it('US-66 AC-2: nothing rebooked, or nobody assigned, sends nothing', async () => {
      await notifier.reservationsRebooked(client(), 'EVT-001', []);
      tx.eventRequest.findUniqueOrThrow.mockResolvedValue({ technicalSupportId: null });
      await notifier.reservationsRebooked(client(), 'EVT-001', [{ ...projectors[0], from: OLD, to: NEW }]);

      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });

  describe('AC-3: the equipment request', () => {
    const event = (technicalSupportId: string | null) => ({
      technicalSupportId,
      technicalSupportNeeds: 'Hybrid setup',
      equipmentRequirements: [{ id: 'REQ-001', equipmentType: 'Microphone', quantity: 2 }],
    });

    it('US-66 AC-3: goes to every Technical Support member while nobody is assigned', async () => {
      prisma.eventRequest.findUnique.mockResolvedValue(event(null));

      expect(await notifier.requirementsChanged('EVT-001')).toBe(2);
      expect(notifications.notifySafely.mock.calls.map(([i]) => i.recipientId)).toEqual(['USR-010', 'USR-011']);
      expect(notifications.notifySafely.mock.calls[0][0]).toEqual({
        recipientId: 'USR-010',
        type: NotificationType.EQUIPMENT_REQUEST_SUBMITTED,
        message: 'Equipment: 2 × Microphone. Technical support: Hybrid setup',
        relatedEventId: 'EVT-001',
      });
    });

    it('US-66 AC-3: goes to the assignee only once someone is assigned', async () => {
      prisma.eventRequest.findUnique.mockResolvedValue(event('USR-011'));

      expect(await notifier.requirementsChanged('EVT-001')).toBe(1);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(notifications.notifySafely.mock.calls[0][0].recipientId).toBe('USR-011');
    });

    it('US-66 AC-3: says so when every requirement was removed', async () => {
      prisma.eventRequest.findUnique.mockResolvedValue({
        technicalSupportId: 'USR-011',
        technicalSupportNeeds: null,
        equipmentRequirements: [],
      });

      await notifier.requirementsChanged('EVT-001');

      expect(notifications.notifySafely.mock.calls[0][0].message).toBe(
        'All equipment and technical requirements were removed.',
      );
    });
  });

  // TC-S4-106 · US-66 AC-3 · setup: none (unit) · fails if a requirements change for an event that has gone notifies anyone or throws
  // Code: TechnicalSupportNotifier.requirementsChanged (event not found)
  it('US-66 AC-3: an event that has gone notifies no one', async () => {
    prisma.eventRequest.findUnique.mockResolvedValue(null);

    await expect(notifier.requirementsChanged('EVT-404')).resolves.toBe(0);
    expect(notifications.notifySafely).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});
