import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventStatus, Role } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action, Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from './events.service';

/** US-10 — assigning a Coordinator as main point of contact. */
describe('EventsService coordinator assignment (US-10)', () => {
  let prisma: {
    eventRequest: { update: jest.Mock; findMany: jest.Mock };
    user: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let access: {
    requireScope: jest.Mock;
    scopedEventFilter: jest.Mock;
    assertEventAccess: jest.Mock;
    projectEvent: jest.Mock;
  };
  let notifications: { notify: jest.Mock; notifySafely: jest.Mock };
  let service: EventsService;

  const coordinator: AuthenticatedUser = {
    userId: 'coordinator-1',
    role: Role.EVENT_COORDINATOR,
    jti: 'jti-1',
  };

  const event = (overrides: Record<string, unknown> = {}) => ({
    id: 'event-1',
    organiserId: 'organiser-1',
    coordinatorId: null,
    status: EventStatus.SUBMITTED,
    ...overrides,
  });

  const coordinatorUser = (id = 'coordinator-2') => ({
    id,
    name: 'Marcus Coordinator',
    email: 'marcus@example.com',
    role: Role.EVENT_COORDINATOR,
  });

  beforeEach(() => {
    prisma = {
      eventRequest: {
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve(event(data)),
        ),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: { findUnique: jest.fn().mockResolvedValue(coordinatorUser()) },
      $transaction: jest.fn((cb) => cb(prisma)),
    };
    access = {
      requireScope: jest.fn().mockReturnValue(Scope.ANY),
      scopedEventFilter: jest.fn().mockReturnValue({}),
      assertEventAccess: jest.fn().mockResolvedValue(event()),
      projectEvent: jest.fn((_u, e) => e),
    };
    notifications = { notify: jest.fn(), notifySafely: jest.fn() };
    service = new EventsService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      notifications as unknown as NotificationsService,
    );
  });

  describe('AC-1: a Coordinator is linked to a submitted event', () => {
    it('sets coordinatorId on the event', async () => {
      await service.assignCoordinator(coordinator, 'event-1', {
        coordinatorId: 'coordinator-2',
      });

      expect(prisma.eventRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'event-1' },
          data: { coordinatorId: 'coordinator-2' },
        }),
      );
    });

    it('checks the ASSIGN grant, not UPDATE', async () => {
      await service.assignCoordinator(coordinator, 'event-1', {
        coordinatorId: 'coordinator-2',
      });

      expect(access.assertEventAccess).toHaveBeenCalledWith(
        coordinator,
        'event-1',
        Action.ASSIGN,
      );
    });

    it('lets a Coordinator claim an unassigned event for themselves', async () => {
      prisma.user.findUnique.mockResolvedValue(coordinatorUser('coordinator-1'));

      await service.assignCoordinator(coordinator, 'event-1', {
        coordinatorId: 'coordinator-1',
      });

      expect(prisma.eventRequest.update.mock.calls[0][0].data.coordinatorId).toBe(
        'coordinator-1',
      );
    });

    it('does not change the event status', async () => {
      await service.assignCoordinator(coordinator, 'event-1', {
        coordinatorId: 'coordinator-2',
      });

      expect(prisma.eventRequest.update.mock.calls[0][0].data).not.toHaveProperty(
        'status',
      );
    });

    it('refuses when the access layer denies', async () => {
      access.assertEventAccess.mockRejectedValue(new ForbiddenException());

      await expect(
        service.assignCoordinator(coordinator, 'event-1', {
          coordinatorId: 'coordinator-2',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.eventRequest.update).not.toHaveBeenCalled();
    });
  });

  describe('AC-2: reassignment moves ownership', () => {
    it('replaces an existing coordinator', async () => {
      access.assertEventAccess.mockResolvedValue(
        event({ coordinatorId: 'coordinator-1' }),
      );

      const result = await service.assignCoordinator(coordinator, 'event-1', {
        coordinatorId: 'coordinator-2',
      });

      expect(result.coordinatorId).toBe('coordinator-2');
    });

    it('leaves exactly one coordinator — the previous link cannot persist', async () => {
      access.assertEventAccess.mockResolvedValue(
        event({ coordinatorId: 'coordinator-1' }),
      );

      await service.assignCoordinator(coordinator, 'event-1', {
        coordinatorId: 'coordinator-2',
      });

      const data = prisma.eventRequest.update.mock.calls[0][0].data;
      expect(data).toEqual({ coordinatorId: 'coordinator-2' });
    });

    it('is idempotent when reassigning the same coordinator', async () => {
      access.assertEventAccess.mockResolvedValue(
        event({ coordinatorId: 'coordinator-2' }),
      );

      const result = await service.assignCoordinator(coordinator, 'event-1', {
        coordinatorId: 'coordinator-2',
      });

      expect(result.coordinatorId).toBe('coordinator-2');
    });
  });

  describe('the target must be a real Coordinator', () => {
    it('rejects an unknown user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.assignCoordinator(coordinator, 'event-1', {
          coordinatorId: 'ghost',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.eventRequest.update).not.toHaveBeenCalled();
    });

    it.each([
      Role.EVENT_ORGANISER,
      Role.VENUE_STAFF,
      Role.TECHNICAL_SUPPORT_STAFF,
      Role.ATTENDEE,
    ])('rejects a %s as the assignee', async (role) => {
      prisma.user.findUnique.mockResolvedValue({ ...coordinatorUser(), role });

      await expect(
        service.assignCoordinator(coordinator, 'event-1', {
          coordinatorId: 'someone',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.eventRequest.update).not.toHaveBeenCalled();
    });
  });

  describe('assignable statuses', () => {
    it.each([
      EventStatus.SUBMITTED,
      EventStatus.UNDER_REVIEW,
      EventStatus.APPROVED,
      EventStatus.PLANNING,
      EventStatus.CONFIRMED,
    ])('allows assignment while %s', async (status) => {
      access.assertEventAccess.mockResolvedValue(event({ status }));

      await expect(
        service.assignCoordinator(coordinator, 'event-1', {
          coordinatorId: 'coordinator-2',
        }),
      ).resolves.toBeDefined();
    });

    it.each([EventStatus.DRAFT, EventStatus.COMPLETED, EventStatus.CANCELLED])(
      'refuses assignment while %s',
      async (status) => {
        access.assertEventAccess.mockResolvedValue(event({ status }));

        await expect(
          service.assignCoordinator(coordinator, 'event-1', {
            coordinatorId: 'coordinator-2',
          }),
        ).rejects.toThrow(ConflictException);
        expect(prisma.eventRequest.update).not.toHaveBeenCalled();
      },
    );
  });

  describe('AC-3: the assigned coordinator is returned', () => {
    it('includes the coordinator relation on the response', async () => {
      await service.assignCoordinator(coordinator, 'event-1', {
        coordinatorId: 'coordinator-2',
      });

      expect(prisma.eventRequest.update.mock.calls[0][0].include).toMatchObject({
        coordinator: { select: { id: true, name: true, email: true } },
      });
    });

    it('includes the coordinator when listing an organiser’s requests', async () => {
      await service.findMyRequests({
        userId: 'organiser-1',
        role: Role.EVENT_ORGANISER,
        jti: 'j',
      });

      expect(prisma.eventRequest.findMany.mock.calls[0][0].include).toMatchObject({
        coordinator: { select: { id: true, name: true, email: true } },
      });
    });
  });
});
