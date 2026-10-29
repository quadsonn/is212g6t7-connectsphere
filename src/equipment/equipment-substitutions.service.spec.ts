import { BadRequestException, ConflictException } from '@nestjs/common';
import { EquipmentStatus, EventStatus, ReservationStatus, Role, SubstitutionStatus } from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AccessControlService } from '../common/access/access-control.service';
import { PrismaService } from '../prisma/prisma.service';
import { acceptError } from './equipment-substitution';
import { EquipmentNotifier } from './equipment-notifier';
import { EquipmentReservationsService } from './equipment-reservations.service';
import { EquipmentSubstitutionsService } from './equipment-substitutions.service';

/**
 * US-67 AC-4 — three backstops the running app cannot reach, because a check
 * or a constraint before them already guarantees the outcome:
 *  - accept: the alternative is checked before the transaction and never changes;
 *  - recording a suggestion: locking an unknown item already answers 404;
 *  - the "decided" notice: the deciding Coordinator cannot be deleted while
 *    assigned (foreign key Restrict).
 * They are forced here with a mocked database so each still behaves as meant
 * if its guarantee is ever lost. Everything reachable is proven against the
 * test database in test/equipment-substitutions.e2e-spec.ts.
 */
describe('US-67 EquipmentSubstitutionsService backstops', () => {
  const cody = { userId: 'USR-004', role: Role.EVENT_COORDINATOR } as AuthenticatedUser;
  const toby = { userId: 'USR-009', role: Role.TECHNICAL_SUPPORT_STAFF } as AuthenticatedUser;
  const event = { id: 'EVT-1', name: 'Gala', status: EventStatus.CONFIRMED, coordinatorId: 'USR-004', technicalSupportId: null };
  const reservation = {
    id: 'RSV-1',
    quantity: 2,
    start: new Date(Date.now() + 864e5),
    end: new Date(Date.now() + 2 * 864e5),
    status: ReservationStatus.APPROVED,
    equipment: { id: 'EQP-1', type: 'Wireless microphone', operationalStatus: EquipmentStatus.OUT_OF_SERVICE },
    event,
  };

  const build = () => {
    const tx = {
      // Every lock finds its row.
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'row' }]),
      equipmentSubstitution: { findUniqueOrThrow: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      equipmentReservation: {
        findUnique: jest.fn().mockResolvedValue({ equipmentId: 'EQP-1' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(reservation),
      },
      equipment: { findMany: jest.fn().mockResolvedValue([]), findUniqueOrThrow: jest.fn().mockResolvedValue({ type: 'Wireless microphone' }) },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const prisma = {
      $transaction: jest.fn((fn) => fn(tx)),
      equipmentSubstitution: {
        findFirst: jest.fn().mockResolvedValue({ alternativeEquipmentId: 'EQP-2', reservation: { equipmentId: 'EQP-1' } }),
      },
    };
    const notifier = { substituteDecided: jest.fn() };
    const service = new EquipmentSubstitutionsService(
      prisma as unknown as PrismaService,
      { requireScope: jest.fn() } as unknown as AccessControlService,
      {} as EquipmentReservationsService,
      notifier as unknown as EquipmentNotifier,
    );
    return { service, tx, notifier };
  };

  // TC-S4-110 · US-67 AC-4 · setup: none (unit) · fails if a suggestion whose alternative is gone by the time it is locked can still be accepted
  // Code: EquipmentSubstitutionsService.accept (alternative re-read inside the transaction)
  it('refuses to accept when the alternative is missing inside the transaction', async () => {
    const { service, tx } = build();
    tx.equipmentSubstitution.findUniqueOrThrow.mockResolvedValue({
      status: SubstitutionStatus.PENDING,
      suggestedById: 'USR-009',
      reservation,
      alternativeEquipment: null,
    });

    await expect(service.accept(cody, 'SUB-1')).rejects.toThrow(new ConflictException(acceptError(null)!));
    expect(tx.equipmentSubstitution.update).not.toHaveBeenCalled();
  });

  // TC-S4-110 · US-67 AC-4 · setup: none (unit) · fails if a suggestion naming an item that cannot be read after its lock is recorded
  // Code: EquipmentSubstitutionsService.create (alternative not found, 400)
  it('refuses a suggestion whose item cannot be read after it was locked', async () => {
    const { service, tx } = build();

    await expect(service.suggest(toby, 'RSV-1', { alternativeEquipmentId: 'EQP-9' })).rejects.toThrow(
      new BadRequestException('alternative EQP-9 not found'),
    );
    expect(tx.equipment.findMany).toHaveBeenCalled();
  });

  // TC-S4-110 · US-67 AC-4 · setup: none (unit) · fails if the "decided" notice breaks when the deciding Coordinator's name cannot be read
  // Code: EquipmentSubstitutionsService.tellTechnicalSupport (coordinator name fallback)
  it('names the Coordinator "The Event Coordinator" when their name cannot be read', async () => {
    const { service, tx, notifier } = build();
    tx.equipmentSubstitution.findUniqueOrThrow.mockResolvedValue({
      status: SubstitutionStatus.PENDING,
      suggestedById: 'USR-009',
      alternativeEquipment: { type: 'Lapel microphone' },
      reservation: { quantity: 2, equipment: { type: 'Wireless microphone' }, event },
    });

    await service.decline(cody, 'SUB-1');

    expect(notifier.substituteDecided).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ coordinatorName: 'The Event Coordinator', accepted: false, recipientIds: ['USR-009'] }),
    );
  });
});
