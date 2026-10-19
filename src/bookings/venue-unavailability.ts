import { BookingStatus } from '@prisma/client';

/**
 * US-52 — the rules for reacting to a venue becoming unavailable, kept free of
 * Nest and the database so they are unit-tested directly.
 */

/** A period during which a venue cannot be used. */
export interface UnavailablePeriod {
  start: Date;
  end: Date;
}

/**
 * The bookings a venue becoming unavailable can affect: those still holding
 * or asking for it. REJECTED and RELEASED bookings hold nothing.
 */
export const AFFECTED_BOOKING_STATUSES: readonly BookingStatus[] = [
  BookingStatus.REQUESTED,
  BookingStatus.APPROVED,
];

/**
 * The "Venue unavailable" flag (AC-2): the booking was marked as needing a
 * replacement, and no replacement has been confirmed yet (AC-5 clears it).
 */
export function needsReplacement(booking: {
  replacementNeededAt: Date | null;
  replacedByBookingId: string | null;
}): boolean {
  return booking.replacementNeededAt !== null && booking.replacedByBookingId === null;
}

/**
 * AC-1 — what the Coordinator is told: the event, the venue, the affected
 * dates and the reason given, and that the event itself still stands.
 */
export function unavailableMessage(input: {
  eventName: string | null;
  venueName: string | null;
  booking: { start: Date; end: Date };
  period: UnavailablePeriod;
  reason: string;
}): string {
  const venue = input.venueName ?? 'A booked venue';
  const event = input.eventName ?? 'your event';

  return (
    `${venue} is unavailable from ${input.period.start.toISOString()} to ${input.period.end.toISOString()}, ` +
    `affecting the booking for "${event}" on ${input.booking.start.toISOString()} – ${input.booking.end.toISOString()}. ` +
    `Reason: ${input.reason}. The event has not been cancelled; request a replacement venue.`
  );
}
