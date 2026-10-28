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
 * Whether a status is one units can be lent out in. Used for the status a
 * change moves units to (US-60 alerts only when units go out of use); an
 * item's own availability is counted from its quantities, below.
 */
export function isLendable(status: EquipmentStatus): boolean {
  return status === EquipmentStatus.OPERATIONAL;
}

/**
 * US-45 — the fields every availability check reads, so US-29, US-31, US-48
 * and the US-19 suitability panel all select the same thing.
 */
export const AVAILABILITY_EQUIPMENT_SELECT = {
  id: true,
  type: true,
  totalQuantity: true,
  operationalStatus: true,
  damagedQuantity: true,
  maintenanceQuantity: true,
} as const satisfies Prisma.EquipmentSelect;

export interface EquipmentCounts {
  totalQuantity: number;
  damagedQuantity: number;
  maintenanceQuantity: number;
}

/** US-45 — units in working order: not damaged and not under maintenance. */
export function workingQuantity(item: EquipmentCounts): number {
  return Math.max(0, item.totalQuantity - item.damagedQuantity - item.maintenanceQuantity);
}

export interface ItemAvailability {
  equipmentId: string;
  type: string;
  /** Derived from the counts (see schema.prisma); kept for older readers. */
  operationalStatus: EquipmentStatus;
  requestedQuantity: number;
  totalQuantity: number;
  /** Units out of use: damaged plus under maintenance (US-45). */
  unavailableQuantity: number;
  /** Peak units committed to overlapping events in the window. */
  reservedQuantity: number;
  /** Units free for the whole window. */
  availableQuantity: number;
  /** False when the requested quantity is not fully available. */
  fullyAvailable: boolean;
  /** How many more units were requested than are free; 0 if none. */
  shortfall: number;
}

/** What availability needs to know of an item. */
export interface AvailabilityEquipment {
  id: string;
  type: string;
  totalQuantity: number;
  operationalStatus: EquipmentStatus;
  /**
   * US-45 counts. When a caller has only the status, they are read from it
   * the way the database trigger does for a status-only write: a whole item
   * marked damaged or under maintenance has all its units in that state.
   */
  damagedQuantity?: number;
  maintenanceQuantity?: number;
}

/** US-45 — an item's damaged and under-maintenance counts. */
export function countsOf(equipment: AvailabilityEquipment): EquipmentCounts {
  return {
    totalQuantity: equipment.totalQuantity,
    damagedQuantity:
      equipment.damagedQuantity ??
      (equipment.operationalStatus === EquipmentStatus.OUT_OF_SERVICE ? equipment.totalQuantity : 0),
    maintenanceQuantity:
      equipment.maintenanceQuantity ??
      (equipment.operationalStatus === EquipmentStatus.UNDER_MAINTENANCE ? equipment.totalQuantity : 0),
  };
}

/**
 * US-29/US-31 — one equipment type's availability for a window.
 *
 * US-45: available = total - damaged - under maintenance - reserved, so
 * marking 2 of 10 damaged takes 2 units away, not all 10.
 */
export function computeItemAvailability(input: {
  equipment: AvailabilityEquipment;
  requestedQuantity: number;
  reservations: readonly ReservationSlot[];
  window: { start: Date; end: Date };
}): ItemAvailability {
  const { equipment, requestedQuantity, reservations, window } = input;

  const unavailableQuantity = equipment.totalQuantity - workingQuantity(countsOf(equipment));
  const reservedQuantity = peakReservedQuantity(reservations, window);

  // Clamped at zero: approved reservations exceeding the working units is a
  // shortage (US-45, computeShortages), not a negative number of free units.
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

/** A reservation as the shortage check sees it. */
export interface ShortageSlot extends ReservationSlot {
  id: string;
}

/**
 * US-45 — how many units each upcoming reservation of one item is short by,
 * given how many units are working.
 *
 * Over each stretch of time from `now` on, the units reserved at once are
 * compared with the working units. Every reservation held during a stretch
 * that is over-committed is short by the excess, at most its own quantity;
 * a reservation is short by its worst stretch. Nobody is singled out: if two
 * reservations of 5 overlap and 7 work, both are short by 3, and it is for
 * Technical Support or the Coordinator to decide which one gives way.
 *
 * Only the time from `now` counts, so a past reservation (or the past part of
 * an ongoing one) never makes anything short. Reservations not short are
 * absent from the result.
 */
export function computeShortages(
  working: number,
  reservations: readonly ShortageSlot[],
  now: Date,
): Map<string, number> {
  const from = now.getTime();
  const live = reservations
    .filter((r) => r.quantity > 0 && r.end.getTime() > from)
    .map((r) => ({ ...r, s: Math.max(r.start.getTime(), from), e: r.end.getTime() }));

  const edges = [...new Set(live.flatMap((r) => [r.s, r.e]))].sort((a, b) => a - b);
  const shortBy = new Map<string, number>();

  for (let i = 0; i < edges.length - 1; i++) {
    const [segStart, segEnd] = [edges[i], edges[i + 1]];
    // Half-open, as overlaps(): held during [segStart, segEnd).
    const held = live.filter((r) => r.s < segEnd && segStart < r.e);
    const excess = held.reduce((sum, r) => sum + r.quantity, 0) - working;
    if (excess <= 0) continue;

    for (const r of held) {
      const short = Math.min(excess, r.quantity);
      if (short > (shortBy.get(r.id) ?? 0)) shortBy.set(r.id, short);
    }
  }

  return shortBy;
}
