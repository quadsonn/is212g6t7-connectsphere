import { EquipmentStatus, Prisma, ReservationStatus } from '@prisma/client';

import { EquipmentCounts, workingQuantity } from './equipment-availability';

/**
 * US-45 — the operational status rules, kept free of Nest and of database
 * access so they can be unit-tested directly (CLAUDE.md §8).
 *
 * Status is by quantity: an item's units are working, damaged or under
 * maintenance, and a change moves a number of them from one to another.
 */

/**
 * The story's names for each status. The stored values predate it (US-29);
 * OUT_OF_SERVICE is what US-30 already read as "damaged".
 */
export const EQUIPMENT_STATUS_LABELS: Readonly<Record<EquipmentStatus, string>> = {
  [EquipmentStatus.OPERATIONAL]: 'Available',
  [EquipmentStatus.UNDER_MAINTENANCE]: 'Under Maintenance',
  [EquipmentStatus.OUT_OF_SERVICE]: 'Damaged',
};

/** How many of an item's units are in each status. */
export function unitsIn(item: EquipmentCounts, status: EquipmentStatus): number {
  switch (status) {
    case EquipmentStatus.OPERATIONAL:
      return workingQuantity(item);
    case EquipmentStatus.OUT_OF_SERVICE:
      return item.damagedQuantity;
    case EquipmentStatus.UNDER_MAINTENANCE:
      return item.maintenanceQuantity;
  }
}

/**
 * AC-1/AC-3 — whether `quantity` units may move from one status to another,
 * and if not, why.
 *
 * Any move between the three statuses is allowed: working units are marked
 * damaged or under maintenance, damaged units go to maintenance, repaired
 * units come back to available. Refused: a move to the same status, and
 * moving more units than are in the status they come from — marking more
 * than are working, or repairing more than are damaged or under maintenance.
 */
export function statusMoveError(
  item: EquipmentCounts & { type: string },
  from: EquipmentStatus,
  to: EquipmentStatus,
  quantity: number,
): string | null {
  if (from === to) {
    return `the units are already ${EQUIPMENT_STATUS_LABELS[to]}`;
  }

  const inFrom = unitsIn(item, from);
  if (quantity <= inFrom) return null;

  const target = EQUIPMENT_STATUS_LABELS[to].toLowerCase();
  if (from === EquipmentStatus.OPERATIONAL) {
    return (
      `Only ${inFrom} of ${item.totalQuantity} ${item.type} are working, ` +
      `so ${quantity} can't be marked ${target}.`
    );
  }
  const source = EQUIPMENT_STATUS_LABELS[from].toLowerCase();
  return (
    `Only ${inFrom} ${item.type} are ${source}, ` +
    `so ${quantity} can't be ${to === EquipmentStatus.OPERATIONAL ? 'set back to available' : `moved to ${target}`}.`
  );
}

/** The counts after moving `quantity` units from one status to another. */
export function applyStatusMove(
  item: EquipmentCounts,
  from: EquipmentStatus,
  to: EquipmentStatus,
  quantity: number,
): { damagedQuantity: number; maintenanceQuantity: number } {
  const delta = (status: EquipmentStatus) =>
    (status === to ? quantity : 0) - (status === from ? quantity : 0);

  return {
    damagedQuantity: item.damagedQuantity + delta(EquipmentStatus.OUT_OF_SERVICE),
    maintenanceQuantity: item.maintenanceQuantity + delta(EquipmentStatus.UNDER_MAINTENANCE),
  };
}

/**
 * AC-5 — the reservations a shortage can touch: committed (APPROVED) ones for
 * a period that has not ended yet. Only a commitment holds units (US-29's
 * HOLDING_STATUSES); a past reservation cannot be affected.
 */
export function upcomingReservationsWhere(
  equipmentId: string,
  now: Date,
): Prisma.EquipmentReservationWhereInput {
  return {
    equipmentId,
    status: ReservationStatus.APPROVED,
    end: { gt: now },
  };
}
