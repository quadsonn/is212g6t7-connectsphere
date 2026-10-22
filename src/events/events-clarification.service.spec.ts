import { ConflictException, ForbiddenException } from '@nestjs/common';
import { EventStatus, NotificationType, Role } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action, Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { EquipmentReservationsService } from '../equipment/equipment-reservations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from './events.service';
import { BookingsService } from '../bookings/bookings.service';

/** US-09 — clarification thread. */
describe('EventsService clarification (US-09)', () => {
  let prisma: {
    eventRequest: { update: jest.Mock; findUniqueOrThrow: jest.Mock; findMany: jest.Mock };
    clarificationMessage: { create: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let access: {
    assertEventAccess: jest.Mock;
    isAssignedCoordinator: jest.Mock;
    scopedEventFilter: jest.Mock;
    projectEvent: jest.Mock;
    requireScope: jest.Mock;
  };
  let notifications: { notify: jest.Mock; notifySafely: jest.Mock };
  let service: EventsService;
  let stored: Record<string, unknown>;

  const coordinator: AuthenticatedUser = {
    userId: 'coordinator-1',
    role: Role.EVENT_COORDINATOR,
    jti: 'j1',
  };
  const organiser: AuthenticatedUser = {
    userId: 'organiser-1',
    role: Role.EVENT_ORGANISER,
    jti: 'j2',
  };

  const event = (overrides: Record<string, unknown> = {}) => ({
    id: 'event-1',
    name: 'Freshman Orientation',
    organiserId: 'organiser-1',
    coordinatorId: 'coordinator-1',
    status: EventStatus.SUBMITTED,
    clarificationRequest: null,
    decisionReason: null,
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
        findUniqueOrThrow: jest.fn().mockImplementation(() =>
          Promise.resolve({ ...stored }),
        ),
        findMany: jest.fn().mockResolvedValue([]),
      },
      clarificationMessage: { create: jest.fn().mockResolvedValue({}) },
      // claimForDecision: the request still holds the status it was read with.
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'event-1' }]),
      $transaction: jest.fn((cb) => cb(prisma)),
    };
    access = {
      assertEventAccess: jest.fn().mockImplementation(() => Promise.resolve({ ...stored })),
      isAssignedCoordinator: jest.fn().mockReturnValue(true),
      scopedEventFilter: jest.fn().mockReturnValue({}),
      projectEvent: jest.fn((_u, e) => e),
      requireScope: jest.fn().mockReturnValue(Scope.ASSIGNED),
    };
    notifications = { notify: jest.fn(), notifySafely: jest.fn() };
    service = new EventsService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      notifications as unknown as NotificationsService,
      { releaseForCancelledEvent: jest.fn() } as unknown as EquipmentReservationsService,
      { releaseForCancelledEvent: jest.fn().mockResolvedValue([]) } as unknown as BookingsService,
    );
  });

  describe('AC-2: the question is tied to its event request', () => {
    it('appends a thread entry against the event', async () => {
      await service.askClarification(coordinator, 'event-1', {
        question: 'Can you confirm the expected attendance?',
      });

      expect(prisma.clarificationMessage.create).toHaveBeenCalledWith({
        data: {
          eventId: 'event-1',
          authorId: 'coordinator-1',
          body: 'Can you confirm the expected attendance?',
        },
      });
    });

    it('records the author, so the trail shows who asked', async () => {
      await service.askClarification(coordinator, 'event-1', { question: 'Q?' });

      expect(prisma.clarificationMessage.create.mock.calls[0][0].data.authorId).toBe(
        'coordinator-1',
      );
    });

    it('does not set createdAt itself — the database timestamps it', async () => {
      await service.askClarification(coordinator, 'event-1', { question: 'Q?' });

      expect(
        prisma.clarificationMessage.create.mock.calls[0][0].data,
      ).not.toHaveProperty('createdAt');
    });
  });

  describe('AC-3: status becomes AWAITING_CLARIFICATION', () => {
    it('transitions through setStatus', async () => {
      const result = await service.askClarification(coordinator, 'event-1', {
        question: 'Q?',
      });

      expect(result.status).toBe(EventStatus.AWAITING_CLARIFICATION);
      const statusWrites = prisma.eventRequest.update.mock.calls.filter(
        ([a]) => 'status' in a.data,
      );
      expect(statusWrites).toHaveLength(1);
      expect(statusWrites[0][0].data).toEqual({
        status: EventStatus.AWAITING_CLARIFICATION,
      });
    });

    it('surfaces the outstanding question to the Organiser view', async () => {
      const result = await service.askClarification(coordinator, 'event-1', {
        question: 'Can you confirm the attendance?',
      });

      expect(result.clarificationRequest).toBe('Can you confirm the attendance?');
      expect(result.clarificationRequested).toBe(true);
    });

    it('asks from UNDER_REVIEW too', async () => {
      stored = event({ status: EventStatus.UNDER_REVIEW });

      await expect(
        service.askClarification(coordinator, 'event-1', { question: 'Q?' }),
      ).resolves.toMatchObject({ status: EventStatus.AWAITING_CLARIFICATION });
    });

    it('refuses to ask on a DRAFT — the transition table forbids it', async () => {
      stored = event({ status: EventStatus.DRAFT });

      await expect(
        service.askClarification(coordinator, 'event-1', { question: 'Q?' }),
      ).rejects.toThrow(ConflictException);
    });

    it('runs the whole ask in one transaction', async () => {
      await service.askClarification(coordinator, 'event-1', { question: 'Q?' });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('AC-4: notifications are raised, not skipped', () => {
    it('notifies the Organiser when a question is asked', async () => {
      await service.askClarification(coordinator, 'event-1', { question: 'Q?' });

      expect(notifications.notifySafely).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'organiser-1',
          type: NotificationType.CLARIFICATION_REQUESTED,
          relatedEventId: 'event-1',
        }),
      );
    });

    it('notifies the Coordinator when the Organiser responds', async () => {
      stored = event({ status: EventStatus.AWAITING_CLARIFICATION });

      await service.respondToClarification(organiser, 'event-1', {
        response: '320 attendees',
      });

      expect(notifications.notifySafely).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'coordinator-1',
          type: NotificationType.CLARIFICATION_ANSWERED,
          relatedEventId: 'event-1',
        }),
      );
    });

    it('skips the notification when no coordinator is assigned', async () => {
      stored = event({
        status: EventStatus.AWAITING_CLARIFICATION,
        coordinatorId: null,
      });

      await service.respondToClarification(organiser, 'event-1', { response: 'x' });

      expect(notifications.notifySafely).not.toHaveBeenCalled();
    });

    it('uses the failure-tolerant path, not the raw one', async () => {
      // notifySafely swallows delivery failures so a notification problem can
      // never undo a committed business action. See the NotificationsService
      // spec for proof that it actually swallows.
      await service.askClarification(coordinator, 'event-1', { question: 'Q?' });

      expect(notifications.notifySafely).toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('raises the notification only after the transition has committed', async () => {
      await service.askClarification(coordinator, 'event-1', { question: 'Q?' });

      // If it were raised inside the transaction, a notification failure could
      // roll back the status change.
      expect(stored.status).toBe(EventStatus.AWAITING_CLARIFICATION);
      expect(notifications.notifySafely).toHaveBeenCalledTimes(1);
    });
  });

  describe('AC-4/AC-5: the Organiser responds', () => {
    it('appends the response to the same thread', async () => {
      stored = event({ status: EventStatus.AWAITING_CLARIFICATION });

      await service.respondToClarification(organiser, 'event-1', {
        response: 'We expect 320 attendees',
      });

      expect(prisma.clarificationMessage.create).toHaveBeenCalledWith({
        data: {
          eventId: 'event-1',
          authorId: 'organiser-1',
          body: 'We expect 320 attendees',
        },
      });
    });

    it('returns the request to UNDER_REVIEW', async () => {
      stored = event({ status: EventStatus.AWAITING_CLARIFICATION });

      const result = await service.respondToClarification(organiser, 'event-1', {
        response: 'Answer',
      });

      expect(result.status).toBe(EventStatus.UNDER_REVIEW);
    });

    it('clears the outstanding question once answered', async () => {
      stored = event({
        status: EventStatus.AWAITING_CLARIFICATION,
        clarificationRequest: 'Q?',
      });

      const result = await service.respondToClarification(organiser, 'event-1', {
        response: 'Answer',
      });

      expect(result.clarificationRequest).toBeNull();
      expect(result.clarificationRequested).toBe(false);
    });

    it('refuses a response when nothing was asked', async () => {
      stored = event({ status: EventStatus.SUBMITTED });

      await expect(
        service.respondToClarification(organiser, 'event-1', { response: 'x' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.clarificationMessage.create).not.toHaveBeenCalled();
    });

    it('supports multiple rounds', async () => {
      await service.askClarification(coordinator, 'event-1', { question: 'Q1' });
      await service.respondToClarification(organiser, 'event-1', { response: 'A1' });
      await service.askClarification(coordinator, 'event-1', { question: 'Q2' });
      await service.respondToClarification(organiser, 'event-1', { response: 'A2' });

      expect(prisma.clarificationMessage.create).toHaveBeenCalledTimes(4);
      expect(
        prisma.clarificationMessage.create.mock.calls.map(([a]) => a.data.body),
      ).toEqual(['Q1', 'A1', 'Q2', 'A2']);
    });
  });

  describe('permissions', () => {
    it('asks under the CLARIFY grant', async () => {
      await service.askClarification(coordinator, 'event-1', { question: 'Q?' });

      expect(access.assertEventAccess).toHaveBeenCalledWith(
        coordinator,
        'event-1',
        Action.CLARIFY,
      );
    });

    it('responds under the CLARIFY grant', async () => {
      stored = event({ status: EventStatus.AWAITING_CLARIFICATION });

      await service.respondToClarification(organiser, 'event-1', { response: 'x' });

      expect(access.assertEventAccess).toHaveBeenCalledWith(
        organiser,
        'event-1',
        Action.CLARIFY,
      );
    });

    it('refuses a Coordinator who is not the assigned one', async () => {
      access.isAssignedCoordinator.mockReturnValue(false);

      await expect(
        service.askClarification(coordinator, 'event-1', { question: 'Q?' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.clarificationMessage.create).not.toHaveBeenCalled();
    });
  });
});
