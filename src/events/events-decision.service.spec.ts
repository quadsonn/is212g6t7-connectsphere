import {
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

/** US-08 — reject and return as distinct decisions. */
describe('EventsService reject / return (US-08)', () => {
  let prisma: {
    eventRequest: { update: jest.Mock; findUniqueOrThrow: jest.Mock; findMany: jest.Mock };
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

  const coordinator: AuthenticatedUser = {
    userId: 'coordinator-1',
    role: Role.EVENT_COORDINATOR,
    jti: 'jti-1',
  };

  const event = (overrides: Record<string, unknown> = {}) => ({
    id: 'event-1',
    organiserId: 'organiser-1',
    coordinatorId: 'coordinator-1',
    status: EventStatus.SUBMITTED,
    decisionReason: null,
    clarificationRequest: null,
    ...overrides,
  });

  /** The single write that touches `status`. */
  const statusWrite = () =>
    prisma.eventRequest.update.mock.calls.filter(([a]) => 'status' in a.data);

  /** The write that records the reason. */
  const reasonWrite = () =>
    prisma.eventRequest.update.mock.calls.find(([a]) => !('status' in a.data));

  /**
   * Mirrors Prisma: update() merges into the stored row and returns the whole
   * record, so the second write in a decision still carries the reason written
   * by the first.
   */
  let stored: Record<string, unknown>;

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
      $transaction: jest.fn((cb) => cb(prisma)),
    };
    access = {
      assertEventAccess: jest.fn().mockImplementation(() =>
        Promise.resolve({ ...stored }),
      ),
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
    );
  });

  describe('AC-1 / AC-3: the two actions are distinct', () => {
    it('reject produces REJECTED', async () => {
      const result = await service.reject(coordinator, 'event-1', {
        reason: 'Clashes with the examination period',
      });

      expect(result.status).toBe(EventStatus.REJECTED);
    });

    it('return produces RETURNED', async () => {
      const result = await service.returnForAmendment(coordinator, 'event-1', {
        reason: 'Please confirm the attendance figure',
      });

      expect(result.status).toBe(EventStatus.RETURNED);
    });

    it('the two never produce the same status', async () => {
      const rejected = await service.reject(coordinator, 'event-1', {
        reason: 'No',
      });

      // A fresh request — a rejected one cannot then be returned, which is
      // itself the point: the two decisions are not interchangeable.
      stored = event();
      const returned = await service.returnForAmendment(coordinator, 'event-1', {
        reason: 'More detail please',
      });

      expect(rejected.status).toBe(EventStatus.REJECTED);
      expect(returned.status).toBe(EventStatus.RETURNED);
      expect(rejected.status).not.toBe(returned.status);
    });

    it('a rejected request cannot then be returned', async () => {
      await service.reject(coordinator, 'event-1', { reason: 'No' });

      await expect(
        service.returnForAmendment(coordinator, 'event-1', { reason: 'x' }),
      ).rejects.toThrow(ConflictException);
    });

    it('reject stores the reason in decisionReason, not clarificationRequest', async () => {
      await service.reject(coordinator, 'event-1', {
        reason: 'Clashes with the examination period',
      });

      expect(reasonWrite()[0].data).toEqual({
        decisionReason: 'Clashes with the examination period',
        clarificationRequest: null,
      });
    });

    it('return stores the reason in clarificationRequest, not decisionReason', async () => {
      await service.returnForAmendment(coordinator, 'event-1', {
        reason: 'Please confirm the attendance figure',
      });

      expect(reasonWrite()[0].data).toEqual({
        clarificationRequest: 'Please confirm the attendance figure',
        decisionReason: null,
      });
    });
  });

  describe('AC-3: status changes go through setStatus', () => {
    it('writes status exactly once, on its own', async () => {
      await service.reject(coordinator, 'event-1', { reason: 'No' });

      expect(statusWrite()).toHaveLength(1);
      expect(statusWrite()[0][0].data).toEqual({ status: EventStatus.REJECTED });
    });

    it('rejects from UNDER_REVIEW too', async () => {
      stored = event({ status: EventStatus.UNDER_REVIEW });

      await expect(
        service.reject(coordinator, 'event-1', { reason: 'No' }),
      ).resolves.toMatchObject({ status: EventStatus.REJECTED });
    });

    it('refuses to reject a DRAFT — the transition table forbids it', async () => {
      stored = event({ status: EventStatus.DRAFT });

      await expect(
        service.reject(coordinator, 'event-1', { reason: 'No' }),
      ).rejects.toThrow(ConflictException);
    });

    it('refuses to return an APPROVED request', async () => {
      stored = event({ status: EventStatus.APPROVED });

      await expect(
        service.returnForAmendment(coordinator, 'event-1', { reason: 'More detail' }),
      ).rejects.toThrow(ConflictException);
    });

    it('runs each decision in one transaction', async () => {
      await service.reject(coordinator, 'event-1', { reason: 'No' });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('AC-4: the reason is retained', () => {
    it('keeps the rejection reason on the returned record', async () => {
      const result = await service.reject(coordinator, 'event-1', {
        reason: 'Clashes with the examination period',
      });

      expect(result.decisionReason).toBe('Clashes with the examination period');
    });

    it('flags an outstanding clarification after a return', async () => {
      const result = await service.returnForAmendment(coordinator, 'event-1', {
        reason: 'Please confirm the attendance figure',
      });

      expect(result.clarificationRequest).toMatch(/attendance/);
      expect(result.clarificationRequested).toBe(true);
    });

    it('a rejection clears any outstanding clarification', async () => {
      stored = event({ clarificationRequest: 'An earlier question' });

      await service.reject(coordinator, 'event-1', { reason: 'No' });

      expect(reasonWrite()[0].data.clarificationRequest).toBeNull();
    });
  });

  describe('assignment ownership', () => {
    it.each([
      ['reject', (s: EventsService) => s.reject(coordinator, 'event-1', { reason: 'No' })],
      [
        'return',
        (s: EventsService) =>
          s.returnForAmendment(coordinator, 'event-1', { reason: 'More detail' }),
      ],
    ])('%s refuses a Coordinator who is not assigned', async (_name, call) => {
      access.isAssignedCoordinator.mockReturnValue(false);

      await expect(call(service)).rejects.toThrow(ForbiddenException);
      expect(prisma.eventRequest.update).not.toHaveBeenCalled();
    });

    it('refuses to decide an unassigned request from the pool', async () => {
      stored = event({ coordinatorId: null });

      await expect(
        service.reject(coordinator, 'event-1', { reason: 'No' }),
      ).rejects.toThrow(ConflictException);
    });

    it('propagates a denial from the access layer', async () => {
      access.assertEventAccess.mockRejectedValue(new NotFoundException());

      await expect(
        service.returnForAmendment(coordinator, 'event-1', { reason: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('checks the REVIEW grant', async () => {
      await service.reject(coordinator, 'event-1', { reason: 'No' });

      expect(access.assertEventAccess).toHaveBeenCalledWith(
        coordinator,
        'event-1',
        Action.REVIEW,
      );
    });
  });
});
