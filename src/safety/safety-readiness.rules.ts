import { BookingStatus, ReservationStatus } from '@prisma/client';

/**
 * Requirement change 6 — when does an event become due for a safety check?
 * Pure functions over plain facts, so the rule is unit-tested without a
 * database and the service only has to gather the facts.
 */

export interface ReadinessFacts {
  bookings: { status: BookingStatus }[];
  /** The equipment the Coordinator recorded as needed (US-28). */
  requirements: { equipmentId: string | null; quantity: number }[];
  reservations: {
    equipmentId: string;
    quantity: number;
    status: ReservationStatus;
  }[];
}

export type NotReadyReason =
  | 'NO_APPROVED_VENUE'
  | 'VENUE_BOOKING_PENDING'
  | 'EQUIPMENT_NOT_RESERVED';

export interface Readiness {
  ready: boolean;
  /** Why not, for the Coordinator and for tests; empty when ready. */
  reasons: NotReadyReason[];
}

/**
 * AC-1: an event appears in the Safety queue once all its venue bookings are
 * approved and any requested equipment is reserved.
 *
 * AMBIGUOUS, and decided here:
 *  - At least one venue booking must exist and be approved. An event with no
 *    venue has nothing whose capacity, layout or exits can be assessed, so
 *    "all bookings approved" is not read as vacuously true.
 *  - A rejected booking holds nothing and is ignored; a pending one blocks.
 *  - "Requested equipment" is the recorded equipment requirements that name a
 *    catalogue item. Each needs approved reservations of that item totalling
 *    at least the quantity asked for. Free-text equipment needs name no item
 *    to reserve and so cannot be checked.
 */
export function evaluateReadiness(facts: ReadinessFacts): Readiness {
  const reasons: NotReadyReason[] = [];

  const live = facts.bookings.filter(
    (booking) => booking.status !== BookingStatus.REJECTED,
  );

  if (live.some((booking) => booking.status === BookingStatus.REQUESTED)) {
    reasons.push('VENUE_BOOKING_PENDING');
  } else if (live.length === 0) {
    reasons.push('NO_APPROVED_VENUE');
  }

  const reserved = new Map<string, number>();
  for (const reservation of facts.reservations) {
    if (reservation.status === ReservationStatus.APPROVED) {
      reserved.set(
        reservation.equipmentId,
        (reserved.get(reservation.equipmentId) ?? 0) + reservation.quantity,
      );
    }
  }

  const needed = new Map<string, number>();
  for (const requirement of facts.requirements) {
    if (requirement.equipmentId) {
      needed.set(
        requirement.equipmentId,
        (needed.get(requirement.equipmentId) ?? 0) + requirement.quantity,
      );
    }
  }

  for (const [equipmentId, quantity] of needed) {
    if ((reserved.get(equipmentId) ?? 0) < quantity) {
      reasons.push('EQUIPMENT_NOT_RESERVED');
      break;
    }
  }

  return { ready: reasons.length === 0, reasons };
}
