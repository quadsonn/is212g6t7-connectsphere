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
import { describeRequirement } from './event-change.rules';
import { EventsService } from './events.service';
import { VenueActivityNotifier } from '../bookings/venue-activity-notifier';

/** US-28 — recording equipment and technical requirements. */
describe('EventsService technical requirements (US-28)', () => {
  let prisma: {
    eventRequest: { update: jest.Mock; findUniqueOrThrow: jest.Mock };
    equipmentRequirement: {
      findMany: jest.Mock;
      deleteMany: jest.Mock;
      createMany: jest.Mock;
    };
    eventChange: { create: jest.Mock };
    equipment: { findMany: jest.Mock };
    venueBooking: { count: jest.Mock };
    equipmentReservation: { count: jest.Mock };
    $transaction: jest.Mock;
  };
  let access: { assertEventAccess: jest.Mock; isAssignedCoordinator: jest.Mock };
  let service: EventsService;
  let stored: Record<string, unknown>;
  let requirements: { equipmentType: string; quantity: number; notes: string | null }[];

  const coordinator: AuthenticatedUser = {
    userId: 'coordinator-1',
    role: Role.EVENT_COORDINATOR,
    jti: 'j1',
  };

  const event = (overrides: Record<string, unknown> = {}) => ({
    id: 'event-1',
    organiserId: 'organiser-1',
    coordinatorId: 'coordinator-1',
    status: EventStatus.PLANNING,
    technicalSupportNeeds: null,
    clarificationRequest: null,
    decisionReason: null,
    ...overrides,
  });

  const projectors = { equipmentType: 'Projector', quantity: 2 };
  const createdChange = () => prisma.eventChange.create.mock.calls[0][0].data;

  beforeEach(() => {
    stored = event();
    requirements = [];
    prisma = {
      eventRequest: {
        update: jest.fn().mockImplementation(({ data }) => {
          stored = { ...stored, ...data };
          return Promise.resolve({ ...stored });
        }),
        findUniqueOrThrow: jest.fn().mockImplementation(() =>
          Promise.resolve({ ...stored, equipmentRequirements: requirements }),
        ),
      },
      equipmentRequirement: {
        findMany: jest.fn().mockImplementation(() => Promise.resolve(requirements)),
        deleteMany: jest.fn().mockImplementation(() => {
          requirements = [];
          return Promise.resolve({});
        }),
        createMany: jest.fn().mockImplementation(({ data }) => {
          requirements = data;
          return Promise.resolve({});
        }),
      },
      eventChange: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'change-1', createdAt: new Date(), changedBy: {}, ...data }),
        ),
      },
      equipment: {
        findMany: jest.fn().mockResolvedValue([{ id: 'cat-projector', type: 'Laser projector' }]),
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
      { requestSubmitted: jest.fn(), approvedBookingChanged: jest.fn(), eventCancelled: jest.fn() } as unknown as VenueActivityNotifier,
    );
  });

  describe('AC-1: equipment type and quantity are saved', () => {
    it('replaces the equipment list', async () => {
      const result = await service.setTechnicalRequirements(coordinator, 'event-1', {
        equipment: [projectors, { equipmentType: ' Wireless mic ', quantity: 6, notes: 'lapel' }],
      });

      expect(prisma.equipmentRequirement.deleteMany).toHaveBeenCalledWith({
        where: { eventId: 'event-1' },
      });
      expect(prisma.equipmentRequirement.createMany).toHaveBeenCalledWith({
        data: [
          { equipmentType: 'Projector', quantity: 2, notes: null, eventId: 'event-1' },
          { equipmentType: 'Wireless mic', quantity: 6, notes: 'lapel', eventId: 'event-1' },
        ],
      });
      expect(result.change?.changes).toEqual([
        {
          field: 'equipmentRequirements',
          previous: [],
          next: ['2 × Projector', '6 × Wireless mic (lapel)'],
        },
      ]);
    });

    it('rejects the same type listed twice, whatever the case', async () => {
      await expect(
        service.setTechnicalRequirements(coordinator, 'event-1', {
          equipment: [projectors, { equipmentType: 'projector', quantity: 1 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.equipmentRequirement.deleteMany).not.toHaveBeenCalled();
    });

    it('does not rewrite an unchanged list', async () => {
      requirements = [{ ...projectors, notes: null }];

      const result = await service.setTechnicalRequirements(coordinator, 'event-1', {
        equipment: [projectors],
      });

      expect(result.change).toBeNull();
      expect(prisma.equipmentRequirement.deleteMany).not.toHaveBeenCalled();
    });

    it('leaves the list alone when it is not sent', async () => {
      await service.setTechnicalRequirements(coordinator, 'event-1', {
        technicalSupportNeeds: 'On-site technician',
      });

      expect(prisma.equipmentRequirement.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('US-37: lines can be linked to the equipment catalogue', () => {
    it('stores the catalogue link and names the line from the catalogue', async () => {
      await service.setTechnicalRequirements(coordinator, 'event-1', {
        equipment: [{ equipmentId: 'cat-projector', equipmentType: 'typed by hand', quantity: 2 }],
      });

      expect(prisma.equipmentRequirement.createMany).toHaveBeenCalledWith({
        data: [
          {
            equipmentId: 'cat-projector',
            equipmentType: 'Laser projector',
            quantity: 2,
            notes: null,
            eventId: 'event-1',
          },
        ],
      });
    });

    it('rejects an equipmentId that is not in the catalogue', async () => {
      await expect(
        service.setTechnicalRequirements(coordinator, 'event-1', {
          equipment: [{ equipmentId: 'ghost', equipmentType: 'x', quantity: 1 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.equipmentRequirement.createMany).not.toHaveBeenCalled();
    });

    it('leaves free-text lines unlinked and skips the catalogue lookup', async () => {
      await service.setTechnicalRequirements(coordinator, 'event-1', { equipment: [projectors] });

      expect(prisma.equipment.findMany).not.toHaveBeenCalled();
      expect(prisma.equipmentRequirement.createMany.mock.calls[0][0].data[0]).not.toHaveProperty(
        'equipmentId',
      );
    });
  });

  describe('AC-2: technical support needs are saved', () => {
    it('saves the description', async () => {
      const result = await service.setTechnicalRequirements(coordinator, 'event-1', {
        technicalSupportNeeds: 'Hybrid setup with Zoom',
      });

      expect(prisma.eventRequest.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { technicalSupportNeeds: 'Hybrid setup with Zoom' },
      });
      expect(result.technicalSupportNeeds).toBe('Hybrid setup with Zoom');
    });

    it('clears it when sent empty', async () => {
      stored = event({ technicalSupportNeeds: 'Old' });

      await service.setTechnicalRequirements(coordinator, 'event-1', {
        technicalSupportNeeds: '  ',
      });

      expect(prisma.eventRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { technicalSupportNeeds: null } }),
      );
    });
  });

  describe('planning only, assigned Coordinator only', () => {
    it.each([EventStatus.SUBMITTED, EventStatus.APPROVED, EventStatus.CONFIRMED])(
      'refuses an event that is %s',
      async (status) => {
        stored = event({ status });

        await expect(
          service.setTechnicalRequirements(coordinator, 'event-1', { equipment: [projectors] }),
        ).rejects.toBeInstanceOf(ConflictException);
      },
    );

    it('refuses a Coordinator the event is not assigned to', async () => {
      access.isAssignedCoordinator.mockReturnValue(false);

      await expect(
        service.setTechnicalRequirements(coordinator, 'event-1', { equipment: [projectors] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('history and review (US-26, US-25 AC-2)', () => {
    it('records the change, unflagged when nothing is reserved', async () => {
      await service.setTechnicalRequirements(coordinator, 'event-1', { equipment: [projectors] });

      expect(createdChange()).toMatchObject({
        changedById: 'coordinator-1',
        requiresReview: false,
      });
    });

    it('flags it when an equipment reservation is approved', async () => {
      prisma.equipmentReservation.count.mockResolvedValue(1);

      await service.setTechnicalRequirements(coordinator, 'event-1', {
        technicalSupportNeeds: 'Add a second technician',
      });

      expect(createdChange()).toMatchObject({
        requiresReview: true,
        affectedArrangements: [ConfirmedArrangement.EQUIPMENT_RESERVATION],
      });
    });
  });

  it('describes a requirement readably for the history', () => {
    expect(describeRequirement({ equipmentType: 'Projector', quantity: 2 })).toBe('2 × Projector');
    expect(
      describeRequirement({ equipmentType: 'Mic', quantity: 1, notes: 'handheld' }),
    ).toBe('1 × Mic (handheld)');
  });
});
