import { BookingStatus, Prisma } from '@prisma/client';

/**
 * The one definition of "this booking overlaps [from, to)", shared by every
 * story that asks it (US-16 calendar, US-17 availability, US-18 search,
 * US-21/US-23 conflicts, US-24 overlap detection).
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
  return overlapsRange(from, to);
}

/**
 * The same rule for any table with `start`/`end` columns — US-16 venue blocks
 * as well as bookings — so there is still exactly one definition of it.
 *
 * The database mirrors it once more, unavoidably, in the US-24 EXCLUDE
 * constraint: tsrange(start, end) with its default '[)' bounds.
 */
export function overlapsRange(
  from: Date,
  to: Date,
): { start: { lt: Date }; end: { gt: Date } } {
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
