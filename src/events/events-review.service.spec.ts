import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventStatus, Role } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action, Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { EquipmentReservationsService } from '../equipment/equipment-reservations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from './events.service';

/** US-07 — Coordinator review and approval. */
describe('EventsService review (US-07)', () => {
  let prisma: {
    eventRequest: {
      update: jest.Mock;
      findMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let access: {
    scopedEventFilter: jest.Mock;
    assertEventAccess: jest.Mock;
    isAssignedCoordinator: jest.Mock;
    projectEvent: jest.Mock;
    requireScope: jest.Mock;
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
    coordinatorId: 'coordinator-1',
    name: 'Freshman Orientation',
    purpose: 'Welcome new students',
    description: 'Full-day programme',
    proposedStart: new Date('2030-10-01T09:00:00Z'),
    proposedEnd: new Date('2030-10-01T17:00:00Z'),
    status: EventStatus.SUBMITTED,
    clarificationRequest: null,
    decisionReason: null,
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      eventRequest: {
        update: jest.fn().mockImplementation(({ data, where }) =>
          Promise.resolve(event({ ...data, id: where.id })),
        ),
        findMany: jest.fn().mockResolvedValue([]),
        findUniqueOrThrow: jest.fn().mockResolvedValue(event()),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };
    access = {
      scopedEventFilter: jest.fn().mockReturnValue({ coordinatorId: 'coordinator-1' }),
      assertEventAccess: jest.fn().mockResolvedValue(event()),
      isAssignedCoordinator: jest.fn().mockReturnValue(true),
      projectEvent: jest.fn((_u, e) => e),
      requireScope: jest.fn().mockReturnValue(Scope.ASSIGNED),
    };
    notifications = { notify: jest.fn(), notifySafely: jest.fn() };
    service = new EventsService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      notifications as unknown as NotificationsService,
      { releaseForCancelledEvent: jest.fn() } as unknown as EquipmentReservationsService,
    );
  });

  describe('AC-1: current status is reported', () => {
    it.each(Object.values(EventStatus))('reports %s', async (status) => {
      prisma.eventRequest.findUniqueOrThrow.mockResolvedValue(event({ status }));

      const result = await service.findAssignedRequest(coordinator, 'event-1');

      expect(result.status).toBe(status);
    });

    it('reports a returned request with its outstanding question', async () => {
      // US-08 made RETURNED a real status, superseding the US-07 reading of
      // "returned" as DRAFT plus a clarification note.
      prisma.eventRequest.findUniqueOrThrow.mockResolvedValue(
        event({
          status: EventStatus.RETURNED,
          clarificationRequest: 'Please confirm the attendance figure',
        }),
      );

      const result = await service.findAssignedRequest(coordinator, 'event-1');

      expect(result.status).toBe(EventStatus.RETURNED);
      expect(result.clarificationRequested).toBe(true);
    });

    it('distinguishes a plain draft from a returned one', async () => {
      prisma.eventRequest.findUniqueOrThrow.mockResolvedValue(
        event({ status: EventStatus.DRAFT }),
      );

      const result = await service.findAssignedRequest(coordinator, 'event-1');

      expect(result.clarificationRequested).toBe(false);
    });
  });

  describe('AC-2: all details are shown', () => {
    it('returns name, purpose, description and proposed dates', async () => {
      const result = await service.findAssignedRequest(coordinator, 'event-1');

      expect(result).toMatchObject({
        name: 'Freshman Orientation',
        purpose: 'Welcome new students',
        description: 'Full-day programme',
      });
      expect(result.proposedStart).toBeInstanceOf(Date);
      expect(result.proposedEnd).toBeInstanceOf(Date);
    });
  });

  describe('AC-3: approving moves the request to APPROVED', () => {
    it('sets status APPROVED', async () => {
      const result = await service.approve(coordinator, 'event-1');

      expect(result.status).toBe(EventStatus.APPROVED);
    });

    it('goes through setStatus rather than a direct write', async () => {
      await service.approve(coordinator, 'event-1');

      const statusWrites = prisma.eventRequest.update.mock.calls.filter(
        ([arg]) => 'status' in arg.data,
      );
      expect(statusWrites).toHaveLength(1);
      expect(statusWrites[0][0].data).toEqual({ status: EventStatus.APPROVED });
    });

    it('approves from UNDER_REVIEW too', async () => {
      access.assertEventAccess.mockResolvedValue(
        event({ status: EventStatus.UNDER_REVIEW }),
      );

      const result = await service.approve(coordinator, 'event-1');

      expect(result.status).toBe(EventStatus.APPROVED);
    });

    it('refuses to approve a DRAFT — the transition table forbids it', async () => {
      access.assertEventAccess.mockResolvedValue(event({ status: EventStatus.DRAFT }));

      await expect(service.approve(coordinator, 'event-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('refuses to approve a CANCELLED request', async () => {
      access.assertEventAccess.mockResolvedValue(
        event({ status: EventStatus.CANCELLED }),
      );

      await expect(service.approve(coordinator, 'event-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('checks the REVIEW grant, not READ', async () => {
      await service.approve(coordinator, 'event-1');

      expect(access.assertEventAccess).toHaveBeenCalledWith(
        coordinator,
        'event-1',
        Action.REVIEW,
      );
    });

    it('runs the whole approval in one transaction', async () => {
      await service.approve(coordinator, 'event-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('clears a stale clarification and rejection reason', async () => {
      access.assertEventAccess.mockResolvedValue(
        event({
          status: EventStatus.SUBMITTED,
          clarificationRequest: 'An earlier question',
          decisionReason: 'An earlier rejection',
        }),
      );

      await service.approve(coordinator, 'event-1');

      const housekeeping = prisma.eventRequest.update.mock.calls.find(
        ([arg]) => !('status' in arg.data),
      );
      expect(housekeeping[0].data).toEqual({
        clarificationRequest: null,
        decisionReason: null,
      });
    });
  });

  describe('assignment ownership', () => {
    it('refuses a Coordinator who is not the assigned one', async () => {
      access.isAssignedCoordinator.mockReturnValue(false);

      await expect(service.approve(coordinator, 'event-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.eventRequest.update).not.toHaveBeenCalled();
    });

    it('refuses to approve an unassigned request from the review pool', async () => {
      access.assertEventAccess.mockResolvedValue(event({ coordinatorId: null }));

      await expect(service.approve(coordinator, 'event-1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.eventRequest.update).not.toHaveBeenCalled();
    });

    it('propagates a denial from the access layer', async () => {
      access.assertEventAccess.mockRejectedValue(new NotFoundException());

      await expect(service.approve(coordinator, 'event-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.eventRequest.update).not.toHaveBeenCalled();
    });
  });
});
