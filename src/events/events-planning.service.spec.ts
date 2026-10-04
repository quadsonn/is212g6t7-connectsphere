import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfirmedArrangement, EventStatus, Role } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { EquipmentReservationsService } from '../equipment/equipment-reservations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService, NO_CHANGES_MESSAGE } from './events.service';

/** US-25 / US-26 — planning edits and change history. */
describe('EventsService planning edits and history (US-25, US-26)', () => {
  let prisma: {
    eventRequest: { update: jest.Mock; findUniqueOrThrow: jest.Mock };
    eventChange: { create: jest.Mock; findMany: jest.Mock };
    venueBooking: { count: jest.Mock };
    equipmentReservation: { count: jest.Mock };
    $transaction: jest.Mock;
  };
  let access: { assertEventAccess: jest.Mock; isAssignedCoordinator: jest.Mock };
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
    name: 'Orientation',
    organiserId: 'organiser-1',
    coordinatorId: 'coordinator-1',
    status: EventStatus.PLANNING,
    proposedStart: new Date('2030-10-01T09:00:00Z'),
    proposedEnd: new Date('2030-10-01T17:00:00Z'),
    expectedAttendance: 320,
    programme: null,
    accessibilityRequirements: [],
    clarificationRequest: null,
    decisionReason: null,
    ...overrides,
  });

  const createdChange = () => prisma.eventChange.create.mock.calls[0][0].data;

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
      eventChange: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'change-1', createdAt: new Date(), changedBy: {}, ...data }),
        ),
        findMany: jest.fn().mockResolvedValue([]),
      },
      venueBooking: { count: jest.fn().mockResolvedValue(0) },
      equipmentReservation: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn((cb) => cb(prisma)),
    };
    access = {
      assertEventAccess: jest.fn().mockImplementation(() => Promise.resolve({ ...stored })),
      isAssignedCoordinator: jest.fn().mockReturnValue(true),
    };
    service = new EventsService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
      { notify: jest.fn(), notifySafely: jest.fn() } as unknown as NotificationsService,
      { releaseForCancelledEvent: jest.fn() } as unknown as EquipmentReservationsService,
    );
  });

  describe('US-25 AC-1: edits are saved during planning', () => {
    it('writes only the fields that changed', async () => {
      const result = await service.updateDuringPlanning(coordinator, 'event-1', {
        name: 'Orientation',
        programme: '09:00 Welcome',
      });

      expect(prisma.eventRequest.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { programme: '09:00 Welcome' },
      });
      expect(result.programme).toBe('09:00 Welcome');
      expect(result.change?.changes).toEqual([
        { field: 'programme', previous: null, next: '09:00 Welcome' },
      ]);
    });

    it('also accepts AWAITING_ARRANGEMENTS as planning', async () => {
      stored = event({ status: EventStatus.AWAITING_ARRANGEMENTS });

      await expect(
        service.updateDuringPlanning(coordinator, 'event-1', { expectedAttendance: 350 }),
      ).resolves.toMatchObject({ expectedAttendance: 350 });
    });

    it.each([EventStatus.APPROVED, EventStatus.SUBMITTED, EventStatus.CONFIRMED])(
      'refuses an event that is %s',
      async (status) => {
        stored = event({ status });

        await expect(
          service.updateDuringPlanning(coordinator, 'event-1', { expectedAttendance: 350 }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.eventRequest.update).not.toHaveBeenCalled();
      },
    );

    it('refuses a Coordinator the event is not assigned to', async () => {
      access.isAssignedCoordinator.mockReturnValue(false);

      await expect(
        service.updateDuringPlanning(coordinator, 'event-1', { expectedAttendance: 350 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects moving the start past the stored end', async () => {
      await expect(
        service.updateDuringPlanning(coordinator, 'event-1', {
          proposedStart: new Date('2030-10-01T18:00:00Z'),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('writes nothing and records nothing when nothing changed', async () => {
      const result = await service.updateDuringPlanning(coordinator, 'event-1', {
        expectedAttendance: 320,
      });

      expect(result.change).toBeNull();
      expect(prisma.eventRequest.update).not.toHaveBeenCalled();
      expect(prisma.eventChange.create).not.toHaveBeenCalled();
    });
  });

  describe('US-25 AC-2: changes to confirmed arrangements are flagged', () => {
    it('flags an attendance change when a venue booking is approved', async () => {
      prisma.venueBooking.count.mockResolvedValue(1);

      const result = await service.updateDuringPlanning(coordinator, 'event-1', {
        expectedAttendance: 500,
      });

      expect(createdChange()).toMatchObject({
        requiresReview: true,
        affectedArrangements: [ConfirmedArrangement.VENUE_BOOKING],
      });
      expect(result.change?.requiresReview).toBe(true);
      // Still saved — AC-3 needs everyone to see the latest value.
      expect(result.expectedAttendance).toBe(500);
    });

    it('treats the same change as ordinary when nothing is confirmed', async () => {
      await service.updateDuringPlanning(coordinator, 'event-1', { expectedAttendance: 500 });

      expect(createdChange()).toMatchObject({
        requiresReview: false,
        affectedArrangements: [],
      });
    });

    it('only asks about approved arrangements', async () => {
      await service.updateDuringPlanning(coordinator, 'event-1', { expectedAttendance: 500 });

      expect(prisma.venueBooking.count).toHaveBeenCalledWith({
        where: { eventId: 'event-1', status: 'APPROVED' },
      });
      expect(prisma.equipmentReservation.count).toHaveBeenCalledWith({
        where: { eventId: 'event-1', status: 'APPROVED' },
      });
    });
  });

  describe('US-26: history', () => {
    it('records who made the change', async () => {
      await service.updateDuringPlanning(coordinator, 'event-1', { expectedAttendance: 500 });

      expect(createdChange()).toMatchObject({
        eventId: 'event-1',
        changedById: 'coordinator-1',
      });
    });

    it('lists entries oldest first', async () => {
      await service.getChangeHistory(coordinator, 'event-1');

      expect(prisma.eventChange.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventId: 'event-1' },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
      );
    });

    it('AC-3: says so when no changes have been recorded', async () => {
      await expect(service.getChangeHistory(coordinator, 'event-1')).resolves.toEqual({
        eventId: 'event-1',
        entries: [],
        message: NO_CHANGES_MESSAGE,
      });
    });

    it('records an Organiser amending a RETURNED request', async () => {
      stored = event({ status: EventStatus.RETURNED });

      await service.updateDraft(organiser, 'event-1', { expectedAttendance: 250 });

      expect(createdChange()).toMatchObject({
        changedById: 'organiser-1',
        requiresReview: false,
        changes: [{ field: 'expectedAttendance', previous: 320, next: 250 }],
      });
    });

    it('does not record edits to a never-submitted draft', async () => {
      stored = event({ status: EventStatus.DRAFT });

      await service.updateDraft(organiser, 'event-1', { expectedAttendance: 250 });

      expect(prisma.eventChange.create).not.toHaveBeenCalled();
    });
  });

  describe('starting planning', () => {
    it('moves an APPROVED event to PLANNING', async () => {
      stored = event({ status: EventStatus.APPROVED });

      const result = await service.startPlanning(coordinator, 'event-1');

      expect(result.status).toBe(EventStatus.PLANNING);
    });

    it('refuses an event that has not been approved', async () => {
      stored = event({ status: EventStatus.SUBMITTED });

      await expect(service.startPlanning(coordinator, 'event-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});
