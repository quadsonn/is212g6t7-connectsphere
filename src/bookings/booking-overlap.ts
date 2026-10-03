import { BookingStatus, Prisma } from '@prisma/client';

/**
 * The one definition of "this booking overlaps [from, to)", shared by every
 * story that asks it (US-17 availability, US-18 search, US-21 conflicts).
 *
 * Half-open on both sides: a booking ending exactly when the range starts, or
 * starting exactly when it ends, does not overlap. Back-to-back slots are not
 * a conflict.
 *
 * Expressed as a Prisma filter rather than a function over loaded rows, so a
 * caller can embed it in a relation filter (`bookings: { none: ... }`) and
 * have Postgres answer for every venue in one query instead of one per venue.
 */
export function overlapping(from: Date, to: Date): Prisma.VenueBookingWhereInput {
  return { start: { lt: to }, end: { gt: from } };
}

/**
 * US-18 AC-1 — a *confirmed* booking overlapping the range. Pending requests
 * deliberately do not count: the AC says "confirmed", and a venue with only a
 * pending request is still bookable. (US-21's conflict check also cares about
 * pending ones — that is a different question.)
 */
export function confirmedOverlapping(
  from: Date,
  to: Date,
): Prisma.VenueBookingWhereInput {
  return { status: BookingStatus.APPROVED, ...overlapping(from, to) };
}
