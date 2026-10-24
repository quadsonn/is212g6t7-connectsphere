import { NotFoundException } from '@nestjs/common';
import { AccessibilityFeature, EventStatus, Role, RoomLayout } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action, Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { EquipmentReservationsService } from '../equipment/equipment-reservations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from './events.service';
import { BookingsService } from '../bookings/bookings.service';

/** US-12 — the Coordinator's full-detail read. */
describe('EventsService coordinator view (US-12)', () => {
  let prisma: {
    eventRequest: {
      findMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
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

  const fullEvent = () => ({
    id: 'event-1',
    organiserId: 'organiser-1',
    coordinatorId: 'coordinator-1',
    name: 'Freshman Orientation',
    purpose: 'Welcome new students',
    description: 'Full-day programme',
    category: 'Student engagement',
    proposedStart: new Date('2030-10-01T09:00:00Z'),
    proposedEnd: new Date('2030-10-01T17:00:00Z'),
    expectedAttendance: 300,
    preferredLayout: RoomLayout.THEATRE,
    layoutNotes: 'Centre aisle required',
    accessibilityRequirements: [AccessibilityFeature.STEP_FREE_ACCESS],
    accessibilityNotes: 'Ramp to the stage',
    equipmentNeeds: 'Six wireless microphones',
    registrationEnabled: true,
    status: EventStatus.SUBMITTED,
  });

  beforeEach(() => {
    prisma = {
      eventRequest: {
        findMany: jest.fn().mockResolvedValue([fullEvent()]),
        findUniqueOrThrow: jest.fn().mockResolvedValue(fullEvent()),
        update: jest.fn(),
        create: jest.fn(),
      },
      user: { findUnique: jest.fn() },
      $transaction: jest.fn((cb) => cb(prisma)),
    };
    access = {
      requireScope: jest.fn().mockReturnValue(Scope.ASSIGNED),
      scopedEventFilter: jest.fn().mockReturnValue({ coordinatorId: 'coordinator-1' }),
      assertEventAccess: jest.fn().mockResolvedValue(fullEvent()),
      projectEvent: jest.fn((_u, e) => e),
    };
    notifications = { notify: jest.fn(), notifySafely: jest.fn() };
    service = new EventsService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      notifications as unknown as NotificationsService,
      { releaseForCancelledEvent: jest.fn(), findUnavailableForEvent: jest.fn().mockResolvedValue([]) } as unknown as EquipmentReservationsService,
      { releaseForCancelledEvent: jest.fn().mockResolvedValue([]) } as unknown as BookingsService,
    );
  });

  describe('AC-1: core details are all present', () => {
    it('returns name, purpose, description, dates and attendance', async () => {
      const result = await service.findAssignedRequest(coordinator, 'event-1');

      expect(result).toMatchObject({
        name: 'Freshman Orientation',
        purpose: 'Welcome new students',
        description: 'Full-day programme',
        expectedAttendance: 300,
      });
      expect(result.proposedStart).toBeInstanceOf(Date);
      expect(result.proposedEnd).toBeInstanceOf(Date);
    });

    it('returns the venue requirements captured in US-06', async () => {
      const result = await service.findAssignedRequest(coordinator, 'event-1');

      expect(result.preferredLayout).toBe(RoomLayout.THEATRE);
      expect(result.layoutNotes).toBe('Centre aisle required');
      // Capacity is a venue requirement too — it is what a venue must seat.
      expect(result.expectedAttendance).toBe(300);
    });

    it('returns the accessibility needs', async () => {
      const result = await service.findAssignedRequest(coordinator, 'event-1');

      expect(result.accessibilityRequirements).toEqual([
        AccessibilityFeature.STEP_FREE_ACCESS,
      ]);
      expect(result.accessibilityNotes).toBe('Ramp to the stage');
    });
  });

  describe('AC-2: equipment and registration requirements', () => {
    it('returns the equipment needs alongside the core details', async () => {
      const result = await service.findAssignedRequest(coordinator, 'event-1');

      expect(result.equipmentNeeds).toBe('Six wireless microphones');
      expect(result.name).toBe('Freshman Orientation');
    });

    it('returns the registration setting', async () => {
      const result = await service.findAssignedRequest(coordinator, 'event-1');

      expect(result.registrationEnabled).toBe(true);
    });

    it('reports absent requirements as null rather than omitting them', async () => {
      prisma.eventRequest.findUniqueOrThrow.mockResolvedValue({
        ...fullEvent(),
        equipmentNeeds: null,
        accessibilityRequirements: [],
        accessibilityNotes: null,
      });

      const result = await service.findAssignedRequest(coordinator, 'event-1');

      expect(result.equipmentNeeds).toBeNull();
      expect(result.accessibilityRequirements).toEqual([]);
    });
  });

  describe('AC-3: unauthorised callers get no data', () => {
    it('propagates the access layer’s denial', async () => {
      access.assertEventAccess.mockRejectedValue(new NotFoundException());

      await expect(
        service.findAssignedRequest(coordinator, 'event-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('never reads the record when access is denied', async () => {
      access.assertEventAccess.mockRejectedValue(new NotFoundException());

      await service.findAssignedRequest(coordinator, 'event-1').catch(() => undefined);

      expect(prisma.eventRequest.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('checks access before reading, not after filtering', async () => {
      await service.findAssignedRequest(coordinator, 'event-1');

      expect(access.assertEventAccess).toHaveBeenCalledWith(
        coordinator,
        'event-1',
        Action.READ,
      );
    });
  });

  describe('reuses the US-02 ownership helper', () => {
    it('scopes the queue through scopedEventFilter', async () => {
      await service.findAssignedRequests(coordinator);

      expect(access.scopedEventFilter).toHaveBeenCalledWith(coordinator, Action.READ);
      expect(prisma.eventRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { coordinatorId: 'coordinator-1' } }),
      );
    });

    it('does not implement its own ownership rule', async () => {
      access.scopedEventFilter.mockReturnValue({ coordinatorId: 'someone-else' });

      await service.findAssignedRequests(coordinator);

      // Whatever the shared helper returns is what gets queried.
      expect(prisma.eventRequest.findMany.mock.calls[0][0].where).toEqual({
        coordinatorId: 'someone-else',
      });
    });
  });

  describe('read-only', () => {
    it('never writes', async () => {
      await service.findAssignedRequests(coordinator);
      await service.findAssignedRequest(coordinator, 'event-1');

      expect(prisma.eventRequest.update).not.toHaveBeenCalled();
      expect(prisma.eventRequest.create).not.toHaveBeenCalled();
    });
  });

  describe('contacts', () => {
    it('resolves both parties to contact details', async () => {
      await service.findAssignedRequest(coordinator, 'event-1');

      expect(
        prisma.eventRequest.findUniqueOrThrow.mock.calls[0][0].include,
      ).toMatchObject({
        organiser: { select: { id: true, name: true, email: true } },
        coordinator: { select: { id: true, name: true, email: true } },
      });
    });
  });
});
