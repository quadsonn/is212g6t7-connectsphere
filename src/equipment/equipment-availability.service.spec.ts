import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EquipmentStatus, ReservationStatus, Role } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { EquipmentService } from './equipment.service';

/** US-30 — checking one item's availability for a date and time. */
describe('EquipmentService checkAvailability (US-30)', () => {
  let prisma: {
    equipment: { findFirst: jest.Mock };
    equipmentReservation: { findMany: jest.Mock };
  };
  let access: { requireScope: jest.Mock };
  let service: EquipmentService;

  const tech: AuthenticatedUser = {
    userId: 'tech-1',
    role: Role.TECHNICAL_SUPPORT_STAFF,
    jti: 'j1',
  };

  const start = new Date('2026-11-02T09:00:00.000Z');
  const end = new Date('2026-11-02T17:00:00.000Z');

  const pa = {
    id: 'eq-pa',
    type: 'Portable PA system',
    totalQuantity: 6,
    operationalStatus: EquipmentStatus.OPERATIONAL as EquipmentStatus,
  };

  const check = (quantity: number) =>
    service.checkAvailability(tech, 'eq-pa', { start, end, quantity });

  beforeEach(() => {
    prisma = {
      equipment: { findFirst: jest.fn().mockResolvedValue(pa) },
      equipmentReservation: { findMany: jest.fn().mockResolvedValue([]) },
    };
    access = { requireScope: jest.fn().mockReturnValue(Scope.ANY) };

    service = new EquipmentService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
    );
  });

  describe('US-30 AC-1: available units for a given date and time', () => {
    it('reports the free count for the window asked about', async () => {
      await expect(check(2)).resolves.toEqual({
        equipmentId: 'eq-pa',
        type: 'Portable PA system',
        operationalStatus: EquipmentStatus.OPERATIONAL,
        requestedQuantity: 2,
        totalQuantity: 6,
        unavailableQuantity: 0,
        reservedQuantity: 0,
        availableQuantity: 6,
        fullyAvailable: true,
        shortfall: 0,
        start,
        end,
      });
    });

    it('is gated on EQUIPMENT/READ before touching the database', async () => {
      access.requireScope.mockImplementation(() => {
        throw new ForbiddenException();
      });

      await expect(check(1)).rejects.toThrow(ForbiddenException);
      expect(access.requireScope).toHaveBeenCalledWith(tech, 'EQUIPMENT', 'READ');
      expect(prisma.equipment.findFirst).not.toHaveBeenCalled();
    });

    it('404s for equipment that does not exist', async () => {
      prisma.equipment.findFirst.mockResolvedValue(null);

      await expect(check(1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('US-30 AC-2: equipment reserved for an overlapping event is excluded', () => {
    it('queries committed reservations of this item overlapping the window', async () => {
      await check(1);

      expect(prisma.equipmentReservation.findMany).toHaveBeenCalledWith({
        where: {
          equipmentId: { in: ['eq-pa'] },
          status: { in: [ReservationStatus.APPROVED] },
          start: { lt: end },
          end: { gt: start },
        },
        select: { quantity: true, start: true, end: true },
      });
    });

    it('subtracts them from the free count', async () => {
      prisma.equipmentReservation.findMany.mockResolvedValue([{ quantity: 4, start, end }]);

      await expect(check(1)).resolves.toMatchObject({
        reservedQuantity: 4,
        availableQuantity: 2,
      });
    });
  });

  describe('US-30 AC-3: damaged or under-maintenance equipment is excluded', () => {
    it.each([EquipmentStatus.UNDER_MAINTENANCE, EquipmentStatus.OUT_OF_SERVICE])(
      'reports no free units for an item %s',
      async (operationalStatus) => {
        prisma.equipment.findFirst.mockResolvedValue({ ...pa, operationalStatus });

        await expect(check(1)).resolves.toMatchObject({
          operationalStatus,
          unavailableQuantity: 6,
          availableQuantity: 0,
          fullyAvailable: false,
        });
      },
    );
  });

  describe('US-30 AC-4: indicates when the requested quantity is not fully available', () => {
    beforeEach(() => {
      prisma.equipmentReservation.findMany.mockResolvedValue([{ quantity: 4, start, end }]);
    });

    it.each([
      ['below', 1, true, 0],
      ['equal to', 2, true, 0],
      ['above', 3, false, 1],
      ['well above', 5, false, 3],
    ])(
      'a request %s the free count → fullyAvailable %s, shortfall %s',
      async (_label, quantity, fully, shortfall) => {
        await expect(check(quantity)).resolves.toMatchObject({
          availableQuantity: 2,
          fullyAvailable: fully,
          shortfall,
        });
      },
    );
  });
});
