import { BookingStatus, ReservationStatus } from '@prisma/client';

/**
 * US-42 — is an event ready for its Coordinator to confirm the arrangements?
 * Pure functions over plain facts, so every rule is unit-tested without a
 * database; EventConfirmationService only gathers the facts.
 */

export type ReadinessItemStatus = 'OK' | 'MISSING' | 'NEEDS_MANUAL_CHECK';

export interface ReadinessItem {
  kind: 'VENUE' | 'EQUIPMENT';
  label: string;
  status: ReadinessItemStatus;
}

export interface ConfirmationReadiness {
  ready: boolean;
  /** Venues first, then equipment, each in the order given. */
  items: ReadinessItem[];
}

export interface ConfirmationFacts {
  /**
   * Every booking the event has. `status` is a string rather than
   * BookingStatus so a status added later (US-54's HELD) is judged by the
   * generic rule below instead of failing to compile or slipping through.
   */
  bookings: { venueName: string; status: string; needsReview: boolean }[];
  /** The equipment the Coordinator recorded as needed (US-28). */
  requirements: {
    equipmentId: string | null;
    equipmentType: string;
    quantity: number;
    manuallyConfirmedAt: Date | null;
  }[];
  reservations: { equipmentId: string; quantity: number; status: ReservationStatus }[];
}

/**
 * Bookings that hold nothing and so are left out of "every live booking".
 * RELEASED is listed by name for when US-54 adds it.
 */
const RELEASED_STATUSES: readonly string[] = [BookingStatus.REJECTED, 'RELEASED'];

function venueItem(booking: ConfirmationFacts['bookings'][number]): ReadinessItem {
  const at = `Venue booking at ${booking.venueName}`;

  if (booking.status === BookingStatus.APPROVED) {
    // US-51: an approved booking flagged after a buffer change is not settled.
    return booking.needsReview
      ? { kind: 'VENUE', label: `${at} needs conflict review`, status: 'MISSING' }
      : { kind: 'VENUE', label: `${at} approved`, status: 'OK' };
  }

  const label =
    booking.status === BookingStatus.REQUESTED
      ? `${at} still pending`
      : booking.status === 'HELD'
        ? `${at} on hold`
        : `${at} not approved (${booking.status})`;

  return { kind: 'VENUE', label, status: 'MISSING' };
}

/**
 * AC-1/AC-2 (Week 7 Change #3: an event may have several bookings).
 *
 * Venues: at least one live booking, and every live one APPROVED with no
 * needsReview flag. An event with no venue has nothing to confirm, so "all
 * bookings approved" is not read as vacuously true.
 *
 * Equipment: a catalogue-linked line is satisfied when the event's APPROVED
 * reservations of that item add up to the quantity; a free-text line names
 * nothing to reserve, so it is satisfied only once the Coordinator has ticked
 * it as manually checked. No requirements recorded means nothing to wait for.
 */
export function evaluateConfirmationReadiness(
  facts: ConfirmationFacts,
): ConfirmationReadiness {
  const live = facts.bookings.filter((b) => !RELEASED_STATUSES.includes(b.status));

  const venueItems: ReadinessItem[] =
    live.length === 0
      ? [{ kind: 'VENUE', label: 'No venue booked', status: 'MISSING' }]
      : live.map(venueItem);

  const reserved = new Map<string, number>();
  for (const r of facts.reservations) {
    if (r.status === ReservationStatus.APPROVED) {
      reserved.set(r.equipmentId, (reserved.get(r.equipmentId) ?? 0) + r.quantity);
    }
  }

  const equipmentItems = facts.requirements.map((req): ReadinessItem => {
    if (req.equipmentId === null) {
      return req.manuallyConfirmedAt
        ? { kind: 'EQUIPMENT', label: `${req.equipmentType} - manually checked`, status: 'OK' }
        : {
            kind: 'EQUIPMENT',
            label: `${req.equipmentType} - needs manual check`,
            status: 'NEEDS_MANUAL_CHECK',
          };
    }

    const have = reserved.get(req.equipmentId) ?? 0;
    const counts = `(${have} of ${req.quantity})`;

    return have >= req.quantity
      ? { kind: 'EQUIPMENT', label: `${req.equipmentType} reserved ${counts}`, status: 'OK' }
      : {
          kind: 'EQUIPMENT',
          label: `${req.equipmentType} not reserved ${counts}`,
          status: 'MISSING',
        };
  });

  const items = [...venueItems, ...equipmentItems];

  return { ready: items.every((item) => item.status === 'OK'), items };
}
