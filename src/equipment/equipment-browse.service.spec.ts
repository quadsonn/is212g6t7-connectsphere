import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { EquipmentSortField, SortOrder } from './dto/browse-equipment.dto';
import { EquipmentService } from './equipment.service';

/** US-28 — viewing the equipment catalogue. */
describe('EquipmentService browse (US-28)', () => {
  let prisma: { equipment: { findMany: jest.Mock; findFirst: jest.Mock } };
  let access: { requireScope: jest.Mock };
  let service: EquipmentService;

  const tech: AuthenticatedUser = {
    userId: 'tech-1',
    role: Role.TECHNICAL_SUPPORT_STAFF,
    jti: 'j1',
  };

  const lastCall = () => prisma.equipment.findMany.mock.calls[0][0];

  beforeEach(() => {
    prisma = {
      equipment: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    access = { requireScope: jest.fn().mockReturnValue(Scope.ANY) };

    service = new EquipmentService(
      prisma as unknown as PrismaService,
      access as unknown as AccessControlService,
    );
  });

  describe('US-28 AC-1: the list carries the at-a-glance fields', () => {
    it('reads straight from the database, scoped by the permission matrix', async () => {
      await service.findAllForUser(tech);

      expect(access.requireScope).toHaveBeenCalledWith(
        tech,
        'EQUIPMENT',
        'READ',
      );
      expect(lastCall().where).toEqual({});
    });

    it('selects only type, description, quantity and location (plus id)', async () => {
      await service.findAllForUser(tech);

      expect(lastCall().select).toEqual({
        id: true,
        type: true,
        description: true,
        totalQuantity: true,
        location: true,
      });
    });

    it('defaults to type ascending', async () => {
      await service.findAllForUser(tech);

      expect(lastCall().orderBy).toEqual([{ type: 'asc' }]);
    });

    it('refuses a role with no equipment read grant', async () => {
      access.requireScope.mockImplementation(() => {
        throw new ForbiddenException();
      });

      await expect(service.findAllForUser(tech)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('US-28 AC-3: finding one item without scrolling', () => {
    it('filters by a case-insensitive type substring', async () => {
      await service.findAllForUser(tech, { search: 'mic' });

      expect(lastCall().where).toEqual({
        AND: [{}, { type: { contains: 'mic', mode: 'insensitive' } }],
      });
    });

    it('ignores an absent search rather than matching nothing', async () => {
      await service.findAllForUser(tech, {});

      expect(lastCall().where).toEqual({});
    });

    it.each([
      [EquipmentSortField.TYPE, { type: 'asc' }],
      [EquipmentSortField.LOCATION, { location: { sort: 'asc', nulls: 'last' } }],
      [EquipmentSortField.TOTAL_QUANTITY, { totalQuantity: 'asc' }],
    ])('sorts by %s', async (sortBy, expected) => {
      await service.findAllForUser(tech, { sortBy });

      expect(lastCall().orderBy[0]).toEqual(expected);
    });

    it('sorts descending when asked', async () => {
      await service.findAllForUser(tech, {
        sortBy: EquipmentSortField.TOTAL_QUANTITY,
        sortOrder: SortOrder.DESC,
      });

      expect(lastCall().orderBy[0]).toEqual({ totalQuantity: 'desc' });
    });

    it('puts items missing a nullable sorted field last, not first', async () => {
      await service.findAllForUser(tech, { sortBy: EquipmentSortField.LOCATION });

      expect(lastCall().orderBy[0].location.nulls).toBe('last');
    });
  });

  describe('US-28 AC-4: no stale data', () => {
    it('queries the database on every call', async () => {
      await service.findAllForUser(tech);
      await service.findAllForUser(tech);
      await service.findAllForUser(tech);

      expect(prisma.equipment.findMany).toHaveBeenCalledTimes(3);
    });
  });

  describe('US-28 AC-2: one item’s full detail', () => {
    it('returns the item when it exists and the caller may read it', async () => {
      const item = { id: 'eq-1', type: 'Projector (4K)' };
      prisma.equipment.findFirst.mockResolvedValue(item);

      await expect(service.findOneForUser(tech, 'eq-1')).resolves.toBe(item);
      expect(prisma.equipment.findFirst).toHaveBeenCalledWith({
        where: { AND: [{ id: 'eq-1' }, {}] },
        select: {
          id: true,
          type: true,
          description: true,
          totalQuantity: true,
          location: true,
          operationalStatus: true,
        },
      });
    });

    it('404s rather than exposing whether the id exists at all', async () => {
      prisma.equipment.findFirst.mockResolvedValue(null);

      await expect(service.findOneForUser(tech, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
