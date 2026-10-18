import { BookingStatus, EquipmentStatus, ReservationStatus } from '@prisma/client';

import { TimeWindow } from '../bookings/booking-reschedule';
import { BookingConflictReport } from '../bookings/booking.types';
import { ItemAvailability } from '../equipment/equipment-availability';
import { CapacityWarning } from './change-request.rules';

/**
 * US-48 — the result of checking an event's arrangements against a pending
 * change request, and the rules for reading it. Pure: the queries live in
 * ChangeArrangementCheckService; this file decides what they mean, so it is
 * unit-tested directly.
 */

/** AC-2 — one of the event's live venue bookings, at the proposed details. */
export interface VenueBookingCheck {
  bookingId: string;
  venueId: string;
  venueName: string | null;
  status: BookingStatus;
  current: TimeWindow;
  /** Where it would be: moved by the event's offset (keeping setup time). */
  proposed: TimeWindow;
  /** AC-6: whether approving moves (rebooks) it. */
  moves: boolean;
  /** Free at the proposed time — setup and turnaround included (US-50). */
  available: boolean;
  /** Why not, one reason per clash. */
  conflicts: string[];
  /** AC-2: a capacity shortfall — a warning, never a block (customer). */
  capacityWarning: string | null;
}

/** AC-6/AC-7 — one item's reservations by this event that approval would move. */
export interface ReservationCheck {
  equipmentId: string;
  equipmentType: string;
  reservationIds: string[];
  /** Units this event holds or awaits of the item, all moving together. */
  quantity: number;
  status: ReservationStatus;
  current: TimeWindow;
  proposed: TimeWindow;
  available: boolean;
  reason: string | null;
}

/** AC-3 — one line of the proposed equipment list. */
export interface EquipmentLineCheck {
  equipmentId: string;
  equipmentType: string;
  quantity: number;
  availableQuantity: number;
  available: boolean;
  reason: string | null;
}

/** AC-4 — one line of the summary. */
export interface ArrangementSummaryItem {
  kind: 'VENUE_BOOKING' | 'EQUIPMENT_RESERVATION' | 'EQUIPMENT';
  label: string;
  /** Present for a conflict. */
  reason: string | null;
}

export interface ArrangementCheck {
  /** The event's window if approved; null when the request moves no dates. */
  newWindow: TimeWindow | null;
  venueBookings: VenueBookingCheck[];
  equipmentReservations: ReservationCheck[];
  equipment: EquipmentLineCheck[];
  /** AC-2: capacity shortfalls — warnings only. */
  warnings: CapacityWarning[];
  /** AC-4: what still works… */
  works: ArrangementSummaryItem[];
  /** …and what would conflict, each with its reason. */
  conflicts: ArrangementSummaryItem[];
  /** AC-7/AC-8: approval goes ahead only with no conflict. Capacity never blocks. */
  canApprove: boolean;
}

const STATUS_WORDS: Partial<Record<EquipmentStatus, string>> = {
  [EquipmentStatus.OUT_OF_SERVICE]: 'damaged',
  [EquipmentStatus.UNDER_MAINTENANCE]: 'under maintenance',
};

/**
 * AC-2 — why a venue would not be free, from the shared buffer-aware report
 * (BookingsService.conflictsFor). `ownBookingIds` are the event's own
 * bookings: they are moving too, so the event never conflicts with itself.
 * Pending requests (soft conflicts) never make a venue unavailable.
 */
export function venueConflicts(
  venueName: string | null,
  report: BookingConflictReport,
  ownBookingIds: ReadonlySet<string>,
): string[] {
  const venue = venueName ?? 'The booked venue';
  return [
    ...report.hardConflicts
      .filter((clash) => !ownBookingIds.has(clash.bookingId))
      .map(
        (clash) =>
          `${venue} is already booked for "${clash.eventName ?? 'another event'}" at the new time (setup and turnaround included).`,
      ),
    ...report.blocks.map(
      (block) => `${venue} is unavailable at the new time${block.reason ? ` (${block.reason})` : ''}.`,
    ),
  ];
}

/**
 * AC-3 — why an item is short, from US-30's availability: a damaged or
 * under-maintenance item has nothing free; otherwise how many are.
 */
export function equipmentShortfall(availability: ItemAvailability): string | null {
  if (availability.fullyAvailable) return null;

  const condition = STATUS_WORDS[availability.operationalStatus];
  if (availability.unavailableQuantity > 0 && condition) {
    return `${availability.type} is ${condition}, so none is available for the new time.`;
  }
  return `Only ${availability.availableQuantity} of ${availability.requestedQuantity} ${availability.type} free for the new time.`;
}

/** AC-4 — sort every checked arrangement into what works and what conflicts. */
export function summarise(parts: {
  newWindow: TimeWindow | null;
  venueBookings: VenueBookingCheck[];
  equipmentReservations: ReservationCheck[];
  equipment: EquipmentLineCheck[];
  warnings: CapacityWarning[];
}): ArrangementCheck {
  const works: ArrangementSummaryItem[] = [];
  const conflicts: ArrangementSummaryItem[] = [];

  for (const b of parts.venueBookings) {
    const label = `Venue booking at ${b.venueName ?? 'the booked venue'}`;
    if (b.available) {
      works.push({ kind: 'VENUE_BOOKING', label, reason: null });
    } else {
      for (const reason of b.conflicts) conflicts.push({ kind: 'VENUE_BOOKING', label, reason });
    }
  }
  for (const r of parts.equipmentReservations) {
    const label = `${r.quantity} × ${r.equipmentType} reservation`;
    (r.available ? works : conflicts).push({ kind: 'EQUIPMENT_RESERVATION', label, reason: r.reason });
  }
  for (const line of parts.equipment) {
    const label = `${line.quantity} × ${line.equipmentType}`;
    (line.available ? works : conflicts).push({ kind: 'EQUIPMENT', label, reason: line.reason });
  }

  return { ...parts, works, conflicts, canApprove: conflicts.length === 0 };
}

/**
 * AC-8 — why an approval was refused because the check failed at the moment
 * of approving (something changed after the page loaded). Every conflict is
 * listed. The request is NOT rejected: it stays pending for the Coordinator to
 * re-check and decide.
 */
export function refusedApprovalMessage(conflicts: readonly ArrangementSummaryItem[]): string {
  return `Cannot approve: the arrangements no longer fit the requested details, so nothing was changed and the request is still pending. ${conflicts
    .map((c) => c.reason)
    .join(' ')}`;
}
