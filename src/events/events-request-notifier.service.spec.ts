import { NotificationType, Role } from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsRequestNotifier } from './events-request-notifier.service';

/**
 * "Notify Coordinators and Leads when a request needs their attention" — the
 * notifier's own rules, mocked away from HTTP and the database. One describe
 * per acceptance criterion; the e2e (test/event-submitted-notification.e2e-spec.ts)
 * proves the same behaviour end-to-end.
 */
describe('EventsRequestNotifier', () => {
  let prisma: { user: { findMany: jest.Mock } };
  let notifications: { notifyMany: jest.Mock };
  let notifier: EventsRequestNotifier;

  /** The recorded notices, flattened across every notifyMany() call. */
  const sent = () =>
    notifications.notifyMany.mock.calls.flatMap(([inputs]) => inputs);

  beforeEach(() => {
    prisma = { user: { findMany: jest.fn().mockResolvedValue([]) } };
    notifications = { notifyMany: jest.fn().mockResolvedValue(0) };
    notifier = new EventsRequestNotifier(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });

  /** Make user.findMany return these ids as the Coordinator Leads. */
  const leadsAre = (...ids: string[]) =>
    prisma.user.findMany.mockResolvedValue(ids.map((id) => ({ id })));

  describe('AC-1/AC-4: a submitted request notifies every Lead, naming and linking it', () => {
    it('sends one EVENT_SUBMITTED notice to each Lead, with the event name and id', async () => {
      leadsAre('lead-1', 'lead-2');

      await notifier.submitted({ id: 'EVT-001', name: 'Freshman Orientation' });

      // Only Leads are fetched as recipients.
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { role: Role.EVENT_COORDINATOR_LEAD } }),
      );
      expect(sent()).toEqual([
        {
          recipientId: 'lead-1',
          type: NotificationType.EVENT_SUBMITTED,
          message: expect.stringContaining('Freshman Orientation'),
          relatedEventId: 'EVT-001',
        },
        {
          recipientId: 'lead-2',
          type: NotificationType.EVENT_SUBMITTED,
          message: expect.stringContaining('Freshman Orientation'),
          relatedEventId: 'EVT-001',
        },
      ]);
    });

    it('falls back to a generic name when the event has none', async () => {
      leadsAre('lead-1');

      await notifier.submitted({ id: 'EVT-002', name: null });

      expect(sent()[0].message).toContain('Untitled event');
    });

    it('records nothing (and does not throw) when there are no Leads', async () => {
      leadsAre();

      await expect(
        notifier.submitted({ id: 'EVT-003', name: 'Orphan' }),
      ).resolves.toBeUndefined();
      expect(notifications.notifyMany).not.toHaveBeenCalled();
    });
  });

  describe('AC-3/AC-4: a change request reaches the assigned Coordinator, else the Leads', () => {
    it('notifies only the assigned Coordinator when the event has one', async () => {
      await notifier.changeRequested({
        id: 'EVT-010',
        name: 'Gala Dinner',
        coordinatorId: 'coord-9',
      });

      // No Lead lookup is needed when a Coordinator is assigned.
      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(sent()).toEqual([
        {
          recipientId: 'coord-9',
          type: NotificationType.EVENT_CHANGE_REQUESTED,
          message: expect.stringMatching(/change.*Gala Dinner|Gala Dinner.*change/i),
          relatedEventId: 'EVT-010',
        },
      ]);
    });

    it('falls back to every Lead when no Coordinator is assigned', async () => {
      leadsAre('lead-1', 'lead-2');

      await notifier.changeRequested({
        id: 'EVT-011',
        name: 'Gala Dinner',
        coordinatorId: null,
      });

      expect(sent().map((n) => n.recipientId)).toEqual(['lead-1', 'lead-2']);
      expect(sent().every((n) => n.type === NotificationType.EVENT_CHANGE_REQUESTED)).toBe(true);
      // AC-4: a change notice says a change was requested.
      expect(sent()[0].message).toMatch(/change/i);
    });
  });

  describe('best-effort: a recording failure never propagates', () => {
    it('swallows a notifyMany rejection so the submission is not undone', async () => {
      leadsAre('lead-1');
      notifications.notifyMany.mockRejectedValue(new Error('db down'));

      await expect(
        notifier.submitted({ id: 'EVT-020', name: 'Resilient' }),
      ).resolves.toBeUndefined();
    });
  });
});
