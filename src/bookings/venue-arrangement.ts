import { BookingStatus } from '@prisma/client';

/**
 * US-53 — whether an event's venues are arranged, derived from its bookings
 * every time it is asked (nothing is stored, so it can never be stale).
 * Pure, so the rule is unit-tested directly.
 */

/**
 * AMBIGUOUS: "required venues" is not defined. Every active booking — one
 * still asking for (REQUESTED) or holding (APPROVED) its venue — counts as
 * required; REJECTED and RELEASED ones hold nothing and do not.
 */
export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[] = [
  BookingStatus.REQUESTED,
  BookingStatus.APPROVED,
];

export interface VenueArrangement {
  /** AC-5: at least one active booking, and every active one approved. */
  arranged: boolean;
  activeBookings: number;
  approvedBookings: number;
  pendingBookings: number;
}

/** AC-5 — the event has its venue arranged only when all required venues are approved. */
export function venueArrangement(bookings: readonly { status: BookingStatus }[]): VenueArrangement {
  const active = bookings.filter((b) => ACTIVE_BOOKING_STATUSES.includes(b.status));
  const approved = active.filter((b) => b.status === BookingStatus.APPROVED).length;

  return {
    arranged: active.length > 0 && approved === active.length,
    activeBookings: active.length,
    approvedBookings: approved,
    pendingBookings: active.length - approved,
  };
}
