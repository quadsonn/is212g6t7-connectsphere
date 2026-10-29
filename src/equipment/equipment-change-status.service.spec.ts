import { EquipmentStatus, EventStatus, ReservationStatus, Role } from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AccessControlService } from '../common/access/access-control.service';
import { PrismaService } from '../prisma/prisma.service';
import { EquipmentNotifier } from './equipment-notifier';
import { EquipmentService } from './equipment.service';

/**
 * US-45 — marking an item out of service when the app runs without the
 * substitutions service (an optional dependency) and an affected event has no
 * Coordinator yet. The status change itself is proven end to end in
 * test/equipment-status.e2e-spec.ts and test/equipment-substitutions.e2e-spec.ts.
 */
describe('US-45 EquipmentService.changeStatus without optional collaborators', () => {
  // TC-S3-89 · US-45 AC-2 · setup: none (unit) · fails if the change breaks without the substitutions service, or on an affected event with no Coordinator
  // Code: EquipmentService.changeStatus (substitutions?.recordForStatusChange ?? []; coordinator?.id ?? null)
  it('records the change and flags the affected event, with no Coordinator to name', async () => {
    const reservation = {
      id: 'RSV-1',
      quantity: 2,
      start: new Date('2030-10-01T09:00:00Z'),
      end: new Date('2030-10-01T12:00:00Z'),
      status: ReservationStatus.APPROVED,
      event: { id: 'EVT-1', name: 'Gala', status: EventStatus.PLANNING, coordinator: null },
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'EQP-1' }]),
      equipment: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ operationalStatus: EquipmentStatus.OPERATIONAL, type: 'Projector' }),
        update: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({ id: 'EQP-1', statusChanges: [] }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'USR-009' }) },
      equipmentStatusChange: { create: jest.fn() },
      equipmentReservation: { findMany: jest.fn().mockResolvedValue([reservation]) },
    };
    const prisma = { $transaction: jest.fn((fn) => fn(tx)) };
    const equipmentNotifier = { unavailable: jest.fn() };
    const service = new EquipmentService(
      prisma as unknown as PrismaService,
      { requireScope: jest.fn() } as unknown as AccessControlService,
      undefined,
      equipmentNotifier as unknown as EquipmentNotifier,
      undefined,
    );

    const result = await service.changeStatus({ userId: 'USR-009', role: Role.TECHNICAL_SUPPORT_STAFF } as AuthenticatedUser, 'EQP-1', {
      status: EquipmentStatus.OUT_OF_SERVICE,
      reason: 'Lamp failed',
    });

    expect(tx.equipmentStatusChange.create).toHaveBeenCalled();
    expect(result.affectedReservations).toEqual([reservation]);
    expect(equipmentNotifier.unavailable).toHaveBeenCalledWith(tx, expect.anything(), [
      { id: 'EVT-1', name: 'Gala', coordinatorId: null, substitutions: [] },
    ]);
  });
});
