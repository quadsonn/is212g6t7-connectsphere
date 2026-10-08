import { EquipmentStatus, Prisma, ReservationStatus } from '@prisma/client';

/**
 * US-30 — the availability rules, kept free of Nest and of database access so
 * they can be unit-tested directly (CLAUDE.md §8). US-32's commit reuses them,
 * so "available" means the same thing when checking and when committing.
 */

/**
 * US-30 AC-2 / US-32 AC-2 — the statuses that hold units. Only a commitment
 * (APPROVED) does; a REQUESTED reservation is not yet committed, and REJECTED
 * and RELEASED (US-33 AC-2) hold nothing.
 */
export const HOLDING_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.APPROVED,
];

/**
 * The reservations that hold units of these items during the window — the one
 * query both the availability check (US-30) and the commit (US-32) count.
 * Overlap is half-open, matching overlaps() below.
 */
export function holdingReservationsWhere(
  equipmentIds: readonly string[],
  window: { start: Date; end: Date },
): Prisma.EquipmentReservationWhereInput {
  return {
    equipmentId: { in: [...equipmentIds] },
    status: { in: [...HOLDING_STATUSES] },
    start: { lt: window.end },
    end: { gt: window.start },
  };
}

/** The slice of a reservation that matters for counting units in use. */
export interface ReservationSlot {
  quantity: number;
  start: Date;
  end: Date;
}

/**
 * Two ranges overlap when each starts before the other ends. Ranges are
 * half-open, so a reservation ending at 12:00 does not clash with an event
 * starting at 12:00 — back-to-back use of the same units is allowed.
 *
 * No turnaround or transit time is added between events: the customer
 * confirmed it is not needed.
 */
export function overlaps(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date },
): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

/**
 * AC-2 — the most units held by other events at any single moment inside the
 * window.
 *
 * The peak, not the plain sum: two reservations of 5 at 09:00–12:00 and
 * 13:00–17:00 both overlap a 09:00–17:00 window, yet never hold more than 5
 * units at once, so 5 — not 10 — are unavailable. Summing would report a
 * shortfall that does not exist.
 *
 * Sweep line over the reservations clipped to the window. At equal timestamps
 * releases are processed before acquisitions, matching the half-open rule in
 * overlaps().
 */
export function peakReservedQuantity(
  reservations: readonly ReservationSlot[],
  window: { start: Date; end: Date },
): number {
  const edges: Array<{ at: number; delta: number }> = [];

  for (const r of reservations) {
    if (r.quantity <= 0 || !overlaps(r, window)) continue;

    const from = Math.max(r.start.getTime(), window.start.getTime());
    const to = Math.min(r.end.getTime(), window.end.getTime());
    edges.push({ at: from, delta: r.quantity }, { at: to, delta: -r.quantity });
  }

  edges.sort((x, y) => x.at - y.at || x.delta - y.delta);

  let current = 0;
  let peak = 0;
  for (const edge of edges) {
    current += edge.delta;
    peak = Math.max(peak, current);
  }

  return peak;
}

/**
 * AC-3 — whether an item's units can be lent out at all.
 *
 * AMBIGUOUS: the briefing gives an item one operational status, not a count
 * per condition, so an item marked UNDER_MAINTENANCE or OUT_OF_SERVICE (read
 * as "damaged") takes all of its units out of availability. Setting the
 * status is #45; this only reads it.
 */
export function isLendable(status: EquipmentStatus): boolean {
  return status === EquipmentStatus.OPERATIONAL;
}

export interface ItemAvailability {
  equipmentId: string;
  type: string;
  operationalStatus: EquipmentStatus;
  requestedQuantity: number;
  totalQuantity: number;
  /** AC-3: units excluded because the item is damaged or under maintenance. */
  unavailableQuantity: number;
  /** AC-2: peak units committed to overlapping events in the window. */
  reservedQuantity: number;
  /** AC-1: units free for the whole window. */
  availableQuantity: number;
  /** AC-4: false when the requested quantity is not fully available. */
  fullyAvailable: boolean;
  /** AC-4: how many more units were requested than are free; 0 if none. */
  shortfall: number;
}

/** AC-1–AC-4 for one equipment type. */
export function computeItemAvailability(input: {
  equipment: {
    id: string;
    type: string;
    totalQuantity: number;
    operationalStatus: EquipmentStatus;
  };
  requestedQuantity: number;
  reservations: readonly ReservationSlot[];
  window: { start: Date; end: Date };
}): ItemAvailability {
  const { equipment, requestedQuantity, reservations, window } = input;

  const unavailableQuantity = isLendable(equipment.operationalStatus)
    ? 0
    : equipment.totalQuantity;
  const reservedQuantity = peakReservedQuantity(reservations, window);

  // Clamped at zero: approved reservations exceeding stock is a data problem
  // to surface elsewhere, not a negative number of free units.
  const availableQuantity = Math.max(
    0,
    equipment.totalQuantity - unavailableQuantity - reservedQuantity,
  );

  return {
    equipmentId: equipment.id,
    type: equipment.type,
    operationalStatus: equipment.operationalStatus,
    requestedQuantity,
    totalQuantity: equipment.totalQuantity,
    unavailableQuantity,
    reservedQuantity,
    availableQuantity,
    fullyAvailable: requestedQuantity <= availableQuantity,
    shortfall: Math.max(0, requestedQuantity - availableQuantity),
  };
}
