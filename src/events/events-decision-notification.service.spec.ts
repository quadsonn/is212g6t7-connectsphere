import { EventStatus, NotificationType, Role } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { EquipmentReservationsService } from '../equipment/equipment-reservations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from './events.service';
import { BookingsService } from '../bookings/bookings.service';

/**
 * The Organiser is notified when the Coordinator approves, rejects, or asks for
 * clarification or amendment on their request. One describe block per criterion.
 */
describe('EventsService decision notifications (Organiser)', () => {
  const coordinator: AuthenticatedUser = {
    userId: 'coordinator-1',
    role: Role.EVENT_COORDINATOR,
    jti: 'j1',
  };

  let prisma: {
    eventRequest: { update: jest.Mock; findUniqueOrThrow: jest.Mock };
    clarificationMessage: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let access: Record<string, jest.Mock>;
  let notifications: { notify: jest.Mock; notifySafely: jest.Mock };
  let service: EventsService;
  let stored: Record<string, unknown>;

  const event = (overrides: Record<string, unknown> = {}) => ({
    id: 'event-1',
    name: 'Freshman Orientation',
    organiserId: 'organiser-1',
    coordinatorId: 'coordinator-1',
    status: EventStatus.UNDER_REVIEW,
    decisionReason: null,
    clarificationRequest: null,
    ...overrides,
  });

  beforeEach(() => {
    stored = event();
    prisma = {
      eventRequest: {
        update: jest.fn().mockImplementation(({ data }) => {
          stored = { ...stored, ...data };
          return Promise.resolve({ ...stored });
        }),
        findUniqueOrThrow: jest.fn().mockImplementation(() => Promise.resolve({ ...stored })),
      },
      clarificationMessage: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((cb) => cb(prisma)),
    };
    access = {
      assertEventAccess: jest.fn().mockImplementation(() => Promise.resolve({ ...stored })),
      isAssignedCoordinator: jest.fn().mockReturnValue(true),
      scopedEventFilter: jest.fn().mockReturnValue({}),
      projectEvent: jest.fn((_u, e) => e),
      requireScope: jest.fn().mockReturnValue(Scope.ASSIGNED),
    };
    notifications = { notify: jest.fn(), notifySafely: jest.fn().mockResolvedValue(undefined) };
    service = new EventsService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      notifications as unknown as NotificationsService,
      { releaseForCancelledEvent: jest.fn() } as unknown as EquipmentReservationsService,
      { releaseForCancelledEvent: jest.fn() } as unknown as BookingsService,
    );
  });

  describe('AC-1 / AC-3: one notification per decision, with the event, outcome and reason', () => {
    it('approve: names the event and says it was approved, with no reason', async () => {
      await service.approve(coordinator, 'event-1');

      expect(notifications.notifySafely).toHaveBeenCalledTimes(1);
      expect(notifications.notifySafely).toHaveBeenCalledWith({
        recipientId: 'organiser-1',
        type: NotificationType.EVENT_STATUS_CHANGED,
        message: 'Your event request "Freshman Orientation" was approved.',
        relatedEventId: 'event-1',
      });
    });

    it('reject: carries the Coordinator’s reason', async () => {
      await service.reject(coordinator, 'event-1', { reason: 'Clashes with exams' });

      expect(notifications.notifySafely).toHaveBeenCalledTimes(1);
      expect(notifications.notifySafely).toHaveBeenCalledWith({
        recipientId: 'organiser-1',
        type: NotificationType.EVENT_STATUS_CHANGED,
        message: 'Your event request "Freshman Orientation" was rejected. Reason: Clashes with exams',
        relatedEventId: 'event-1',
      });
    });

    it('return for amendment: carries what to amend', async () => {
      await service.returnForAmendment(coordinator, 'event-1', { reason: 'Add a budget' });

      expect(notifications.notifySafely).toHaveBeenCalledTimes(1);
      expect(notifications.notifySafely).toHaveBeenCalledWith({
        recipientId: 'organiser-1',
        type: NotificationType.EVENT_STATUS_CHANGED,
        message:
          'Your event request "Freshman Orientation" was returned for amendment. Reason: Add a budget',
        relatedEventId: 'event-1',
      });
    });

    it('clarification: carries the question itself', async () => {
      await service.askClarification(coordinator, 'event-1', { question: 'How many guests?' });

      expect(notifications.notifySafely).toHaveBeenCalledTimes(1);
      expect(notifications.notifySafely).toHaveBeenCalledWith({
        recipientId: 'organiser-1',
        type: NotificationType.CLARIFICATION_REQUESTED,
        message:
          'The coordinator has asked a question about "Freshman Orientation". Reason: How many guests?',
        relatedEventId: 'event-1',
      });
    });

    it('falls back to a generic name for an event with none', async () => {
      stored = event({ name: null });

      await service.approve(coordinator, 'event-1');

      expect(notifications.notifySafely.mock.calls[0][0].message).toBe(
        'Your event request "your event request" was approved.',
      );
    });
  });

  describe('AC-2: only the Organiser who owns the request is notified', () => {
    it.each([
      ['approve', () => service.approve(coordinator, 'event-1')],
      ['reject', () => service.reject(coordinator, 'event-1', { reason: 'No' })],
      ['return', () => service.returnForAmendment(coordinator, 'event-1', { reason: 'Fix' })],
      ['clarification', () => service.askClarification(coordinator, 'event-1', { question: 'Q?' })],
    ])('%s goes to the request’s own Organiser and nobody else', async (_name, act) => {
      await act();

      const recipients = notifications.notifySafely.mock.calls.map(([n]) => n.recipientId);
      expect(recipients).toEqual(['organiser-1']);
      expect(recipients).not.toContain('coordinator-1');
    });
  });

  describe('AC-5: one notification per decision, not per click', () => {
    it('a repeated approve of an approved request sends nothing more', async () => {
      stored = event({ status: EventStatus.APPROVED });

      await service.approve(coordinator, 'event-1');

      expect(notifications.notifySafely).not.toHaveBeenCalled();
    });

    it('a repeated reject of a rejected request sends nothing more', async () => {
      stored = event({ status: EventStatus.REJECTED });

      await service.reject(coordinator, 'event-1', { reason: 'Again' });

      expect(notifications.notifySafely).not.toHaveBeenCalled();
    });
  });

  describe('a decision that is refused sends nothing', () => {
    it('an illegal transition (rejecting a draft) raises no notification', async () => {
      stored = event({ status: EventStatus.DRAFT });

      await expect(service.reject(coordinator, 'event-1', { reason: 'No' })).rejects.toThrow();
      expect(notifications.notifySafely).not.toHaveBeenCalled();
    });

    it('is sent after the decision commits, so a failed decision notifies no one', async () => {
      prisma.$transaction.mockRejectedValue(new Error('db down'));

      await expect(service.approve(coordinator, 'event-1')).rejects.toThrow('db down');
      expect(notifications.notifySafely).not.toHaveBeenCalled();
    });
  });

  describe('AC-6: no notification when a draft is saved', () => {
    it('saving a draft and editing one raise nothing', async () => {
      const organiser: AuthenticatedUser = {
        userId: 'organiser-1',
        role: Role.EVENT_ORGANISER,
        jti: 'j2',
      };
      prisma.eventRequest = {
        ...prisma.eventRequest,
        create: jest.fn().mockResolvedValue(event({ status: EventStatus.DRAFT })),
      } as typeof prisma.eventRequest;

      await service.saveDraft(organiser, { name: 'Draft' });

      expect(notifications.notifySafely).not.toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });
});
