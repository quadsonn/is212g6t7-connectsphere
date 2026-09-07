import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventStatus, Role } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../auth/jwt.strategy';
import { AccessControlService } from './access-control.service';
import { Action, Resource, Scope } from './permission.types';

describe('AccessControlService (US-02)', () => {
  let prisma: { eventRequest: { findFirst: jest.Mock } };
  let service: AccessControlService;

  const userWith = (role: Role, userId = 'u1'): AuthenticatedUser => ({
    userId,
    role,
    jti: 'jti-1',
  });

  const anEvent = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'event-1',
      organiserId: 'organiser-1',
      coordinatorId: 'coordinator-1',
      name: 'Orientation',
      purpose: 'Welcome new students',
      description: 'A description',
      proposedStart: new Date('2026-10-01T09:00:00Z'),
      proposedEnd: new Date('2026-10-01T17:00:00Z'),
      expectedAttendance: 300,
      preferredLayout: 'Theatre',
      layoutNotes: 'Internal note about staging',
      accessibilityNeeds: 'Internal accessibility planning',
      equipmentNeeds: 'Internal equipment planning',
      registrationEnabled: true,
      status: EventStatus.CONFIRMED,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as never;

  beforeEach(() => {
    prisma = { eventRequest: { findFirst: jest.fn() } };
    service = new AccessControlService(prisma as unknown as PrismaService);
  });

  describe('requireScope', () => {
    it('returns the scope for a granted action (AC-2)', () => {
      expect(
        service.requireScope(userWith(Role.EVENT_ORGANISER), Resource.EVENT, Action.CREATE),
      ).toBe(Scope.OWN);
    });

    it('throws for an ungranted action (AC-1)', () => {
      expect(() =>
        service.requireScope(userWith(Role.ATTENDEE), Resource.EVENT, Action.CREATE),
      ).toThrow(ForbiddenException);
    });
  });

  describe('AC-5: Organiser sees only their own', () => {
    it('narrows the list query to their own events', () => {
      expect(
        service.scopedEventFilter(userWith(Role.EVENT_ORGANISER, 'organiser-1')),
      ).toEqual({ organiserId: 'organiser-1' });
    });

    it('finds an event they own', async () => {
      prisma.eventRequest.findFirst.mockResolvedValue(anEvent());
      await expect(
        service.assertEventAccess(userWith(Role.EVENT_ORGANISER, 'organiser-1'), 'event-1'),
      ).resolves.toBeDefined();
    });

    it('denies an event owned by someone else', async () => {
      prisma.eventRequest.findFirst.mockResolvedValue(null);
      await expect(
        service.assertEventAccess(userWith(Role.EVENT_ORGANISER, 'other'), 'event-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('AC-6: Coordinator sees only assigned', () => {
    it('narrows the list query to assigned events', () => {
      expect(
        service.scopedEventFilter(userWith(Role.EVENT_COORDINATOR, 'coordinator-1')),
      ).toEqual({ coordinatorId: 'coordinator-1' });
    });

    it('denies an event assigned to a different coordinator', async () => {
      prisma.eventRequest.findFirst.mockResolvedValue(null);
      await expect(
        service.assertEventAccess(userWith(Role.EVENT_COORDINATOR, 'other'), 'event-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('recognises the assigned coordinator', () => {
      expect(
        service.isAssignedCoordinator(userWith(Role.EVENT_COORDINATOR, 'coordinator-1'), anEvent()),
      ).toBe(true);
    });

    it('does not treat an unassigned event as assigned', () => {
      expect(
        service.isAssignedCoordinator(
          userWith(Role.EVENT_COORDINATOR, 'coordinator-1'),
          anEvent({ coordinatorId: null }),
        ),
      ).toBe(false);
    });
  });

  describe('ownership helper', () => {
    it('recognises the owning organiser', () => {
      expect(service.isOwner(userWith(Role.EVENT_ORGANISER, 'organiser-1'), anEvent())).toBe(true);
    });

    it('rejects a non-owner', () => {
      expect(service.isOwner(userWith(Role.EVENT_ORGANISER, 'someone-else'), anEvent())).toBe(false);
    });
  });

  describe('AC-7: Attendee sees only registration-facing info', () => {
    it('restricts the list to events past review', () => {
      expect(service.scopedEventFilter(userWith(Role.ATTENDEE))).toEqual({
        status: {
          in: [
            EventStatus.APPROVED,
            EventStatus.PLANNING,
            EventStatus.CONFIRMED,
            EventStatus.COMPLETED,
          ],
        },
      });
    });

    it('strips internal planning fields from the record', () => {
      const projected = service.projectEvent(userWith(Role.ATTENDEE), anEvent()) as Record<string, unknown>;

      expect(projected).not.toHaveProperty('layoutNotes');
      expect(projected).not.toHaveProperty('accessibilityNeeds');
      expect(projected).not.toHaveProperty('equipmentNeeds');
      expect(projected).not.toHaveProperty('expectedAttendance');
      expect(projected).not.toHaveProperty('organiserId');
      expect(projected).not.toHaveProperty('coordinatorId');
      expect(projected).not.toHaveProperty('preferredLayout');
    });

    it('keeps the fields registration needs', () => {
      const projected = service.projectEvent(userWith(Role.ATTENDEE), anEvent()) as Record<string, unknown>;

      expect(projected).toMatchObject({
        id: 'event-1',
        name: 'Orientation',
        registrationEnabled: true,
        status: EventStatus.CONFIRMED,
      });
    });

    it('leaves the full record intact for an Organiser', () => {
      const projected = service.projectEvent(
        userWith(Role.EVENT_ORGANISER, 'organiser-1'),
        anEvent(),
      ) as Record<string, unknown>;

      expect(projected).toHaveProperty('layoutNotes');
      expect(projected).toHaveProperty('expectedAttendance');
    });

    it('leaves the full record intact for a Coordinator', () => {
      const projected = service.projectEvent(
        userWith(Role.EVENT_COORDINATOR, 'coordinator-1'),
        anEvent(),
      ) as Record<string, unknown>;

      expect(projected).toHaveProperty('equipmentNeeds');
    });
  });

  describe('roles with no event grant', () => {
    it('refuses to build a filter for Venue Staff', () => {
      expect(() => service.scopedEventFilter(userWith(Role.VENUE_STAFF))).toThrow(
        ForbiddenException,
      );
    });
  });
});
