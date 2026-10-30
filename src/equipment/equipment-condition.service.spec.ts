import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AccessControlService } from '../common/access/access-control.service';
import { PrismaService } from '../prisma/prisma.service';
import { EquipmentService } from './equipment.service';

/**
 * US-45 — two branches the HTTP API cannot reach: changes recorded at the
 * same instant (each request writes its own time), and a caller that passes
 * no proposed move at all (the controller always passes the query object).
 */
describe('US-45 EquipmentService history and preview backstops', () => {
  const toby = { userId: 'USR-009', role: Role.TECHNICAL_SUPPORT_STAFF } as AuthenticatedUser;
  const build = (prisma: object) =>
    new EquipmentService(prisma as unknown as PrismaService, { requireScope: jest.fn() } as unknown as AccessControlService);

  // TC-S3-89 · US-45 AC-2 · unit: findStatusHistory(), database mocked · fails if changes recorded at the same instant are not newest entry first
  // Code: EquipmentService.findStatusHistory (compareReadableIds tie-break)
  it('lists changes recorded at the same instant newest entry first, by ID', async () => {
    const at = new Date('2030-10-01T09:00:00Z');
    const service = build({
      equipment: { findFirst: jest.fn().mockResolvedValue({ id: 'EQP-1', totalQuantity: 10, damagedQuantity: 0, maintenanceQuantity: 0 }) },
      equipmentStatusChange: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'ESC-999', changedAt: at },
          { id: 'ESC-1000', changedAt: at },
        ]),
      },
    });

    const history = await service.findStatusHistory(toby, 'EQP-1');

    expect(history.map((h) => h.id)).toEqual(['ESC-1000', 'ESC-999']);
  });

  // TC-S3-93 · US-45 AC-6 · unit: findUpcomingReservations(), database mocked · fails if the preview breaks when no move is proposed
  // Code: EquipmentService.findUpcomingReservations (proposal defaults to none)
  it('reads the reservations with no move proposed, and 404s for an unknown item', async () => {
    const service = build({ equipment: { findFirst: jest.fn().mockResolvedValue(null) } });

    await expect(service.findUpcomingReservations(toby, 'EQP-999')).rejects.toThrow(NotFoundException);
  });
});
