import {
  EquipmentStatus,
  EventStatus,
  Prisma,
  ReservationStatus,
} from '@prisma/client';

import { isLendable } from './equipment-availability';

/**
 * US-45 — the operational status rules, kept free of Nest and of database
 * access so they can be unit-tested directly (CLAUDE.md §8).
 */

/**
 * The story's names for each status. The stored values predate it (US-29);
 * OUT_OF_SERVICE is what US-30 already read as "damaged".
 */
export const EQUIPMENT_STATUS_LABELS: Readonly<
  Record<EquipmentStatus, string>
> = {
  [EquipmentStatus.OPERATIONAL]: 'Available',
  [EquipmentStatus.UNDER_MAINTENANCE]: 'Under Maintenance',
  [EquipmentStatus.OUT_OF_SERVICE]: 'Damaged',
};

/**
 * AC-1/AC-3 — whether an item may move from one status to another, and if
 * not, why. Every move between the three statuses is allowed (damaged items
 * go to maintenance, repaired items come back to available); only a "change"
 * to the status the item already has is refused, since it would record a
 * reason for nothing happening.
 */
export function statusChangeError(
  from: EquipmentStatus,
  to: EquipmentStatus,
): string | null {
  if (from === to) {
    return `this item is already ${EQUIPMENT_STATUS_LABELS[to]}`;
  }
  return null;
}

/**
 * AC-5 — the reservations a status change puts at risk: those still holding
 * (APPROVED) or awaiting (REQUESTED) units of this item for a period that has
 * not ended yet. Released and rejected reservations hold nothing, and a
 * reservation that is already over cannot be affected.
 *
 * The same two statuses US-33 treats as live (RELEASABLE_STATUSES).
 */
export const AFFECTED_RESERVATION_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.REQUESTED,
  ReservationStatus.APPROVED,
];

/**
 * Events that are over or ended without going ahead. Equipment trouble is no
 * longer their concern, so it is neither flagged on them nor notified to
 * their Coordinator, whatever the dates on a leftover reservation say.
 */
export const FINISHED_EVENT_STATUSES: readonly EventStatus[] = [
  EventStatus.COMPLETED,
  EventStatus.CANCELLED,
  EventStatus.REJECTED,
];

export function upcomingReservationsWhere(
  equipmentId: string,
  now: Date,
): Prisma.EquipmentReservationWhereInput {
  return {
    equipmentId,
    status: { in: [...AFFECTED_RESERVATION_STATUSES] },
    end: { gt: now },
    event: { status: { notIn: [...FINISHED_EVENT_STATUSES] } },
  };
}

/**
 * AC-5 — only taking an item out of use affects its reservations. Setting it
 * back to Available (AC-3) frees units rather than withdrawing them, so there
 * is nothing to warn about.
 */
export function affectsReservations(to: EquipmentStatus): boolean {
  return !isLendable(to);
}
