import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventStatus, NotificationType, Role } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { EquipmentReservationsService } from '../equipment/equipment-reservations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from './events.service';

/** US-26 — the responsible Coordinator hands an event to a colleague. */
describe('EventsService reassignment (US-26)', () => {
  let prisma: {
    eventRequest: { update: jest.Mock };
    eventChange: { create: jest.Mock };
    user: { findUnique: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let access: { assertEventAccess: jest.Mock; isAssignedCoordinator: jest.Mock };
  let notifications: { notify: jest.Mock; notifySafely: jest.Mock };
  let service: EventsService;
  let stored: Record<string, unknown>;

  const marcus: AuthenticatedUser = {
    userId: 'coordinator-1',
    role: Role.EVENT_COORDINATOR,
    jti: 'j1',
  };

  const event = (overrides: Record<string, unknown> = {}) => ({
    id: 'event-1',
    name: 'Orientation',
    organiserId: 'organiser-1',
    coordinatorId: 'coordinator-1',
    coordinator: { id: 'coordinator-1', name: 'Marcus', email: 'marcus@example.com' },
    status: EventStatus.PLANNING,
    clarificationRequest: null,
    decisionReason: null,
    ...overrides,
  });

  const fatima = {
    id: 'coordinator-2',
    name: 'Fatima',
    email: 'fatima@example.com',
    role: Role.EVENT_COORDINATOR,
  };

  beforeEach(() => {
    stored = event();
    prisma = {
      eventRequest: {
        update: jest.fn().mockImplementation(({ data }) => {
          stored = { ...stored, ...data };
          return Promise.resolve({ ...stored });
        }),
      },
      eventChange: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'change-1', createdAt: new Date(), changedBy: {}, ...data }),
        ),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(fatima),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };
    access = {
      assertEventAccess: jest.fn().mockImplementation(() => Promise.resolve({ ...stored })),
      isAssignedCoordinator: jest.fn().mockReturnValue(true),
    };
    notifications = { notify: jest.fn(), notifySafely: jest.fn() };
    service = new EventsService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      notifications as unknown as NotificationsService,
      { releaseForCancelledEvent: jest.fn() } as unknown as EquipmentReservationsService,
    );
  });

  describe('AC-1: a new Coordinator can be selected', () => {
    it('offers every other Coordinator', async () => {
      await service.getReassignmentCandidates(marcus, 'event-1');

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { role: Role.EVENT_COORDINATOR, id: { not: 'coordinator-1' } },
        }),
      );
    });

    it('loads the event through the ASSIGN grant', async () => {
      await service.getReassignmentCandidates(marcus, 'event-1');

      expect(access.assertEventAccess).toHaveBeenCalledWith(marcus, 'event-1', Action.ASSIGN);
    });

    it('refuses a Coordinator who is not responsible for the event', async () => {
      access.isAssignedCoordinator.mockReturnValue(false);

      await expect(service.getReassignmentCandidates(marcus, 'event-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        service.reassign(marcus, 'event-1', { coordinatorId: 'coordinator-2' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.eventRequest.update).not.toHaveBeenCalled();
    });

    it.each([EventStatus.COMPLETED, EventStatus.CANCELLED, EventStatus.REJECTED])(
      'refuses an event that is %s',
      async (status) => {
        stored = event({ status });

        await expect(
          service.reassign(marcus, 'event-1', { coordinatorId: 'coordinator-2' }),
        ).rejects.toBeInstanceOf(ConflictException);
      },
    );
  });

  describe('AC-2: the assigned Coordinator is updated', () => {
    it('links the new Coordinator', async () => {
      const result = await service.reassign(marcus, 'event-1', {
        coordinatorId: 'coordinator-2',
      });

      expect(prisma.eventRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { coordinatorId: 'coordinator-2' } }),
      );
      expect(result.coordinatorId).toBe('coordinator-2');
    });

    it('leaves the status alone', async () => {
      const result = await service.reassign(marcus, 'event-1', {
        coordinatorId: 'coordinator-2',
      });

      expect(result.status).toBe(EventStatus.PLANNING);
    });

    it('rejects reassigning to yourself', async () => {
      await expect(
        service.reassign(marcus, 'event-1', { coordinatorId: 'coordinator-1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a user who is not a Coordinator', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...fatima, role: Role.ATTENDEE });

      await expect(
        service.reassign(marcus, 'event-1', { coordinatorId: 'coordinator-2' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an unknown user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.reassign(marcus, 'event-1', { coordinatorId: 'nobody' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('AC-3: both Coordinators are notified', () => {
    it('notifies the previous and the new Coordinator', async () => {
      await service.reassign(marcus, 'event-1', { coordinatorId: 'coordinator-2' });

      const recipients = notifications.notifySafely.mock.calls.map(([n]) => n.recipientId);
      expect(recipients).toEqual(['coordinator-1', 'coordinator-2']);
      for (const [n] of notifications.notifySafely.mock.calls) {
        expect(n).toMatchObject({
          type: NotificationType.EVENT_REASSIGNED,
          relatedEventId: 'event-1',
        });
      }
    });

    it('notifies nobody when the reassignment is refused', async () => {
      access.isAssignedCoordinator.mockReturnValue(false);

      await expect(
        service.reassign(marcus, 'event-1', { coordinatorId: 'coordinator-2' }),
      ).rejects.toThrow();
      expect(notifications.notifySafely).not.toHaveBeenCalled();
    });
  });

  describe('AC-4: the reassignment is in the change history', () => {
    it('records previous and new Coordinator, and who did it', async () => {
      await service.reassign(marcus, 'event-1', { coordinatorId: 'coordinator-2' });

      expect(prisma.eventChange.create.mock.calls[0][0].data).toMatchObject({
        eventId: 'event-1',
        changedById: 'coordinator-1',
        requiresReview: false,
        changes: [{ field: 'coordinator', previous: 'Marcus', next: 'Fatima' }],
      });
    });
  });
});
