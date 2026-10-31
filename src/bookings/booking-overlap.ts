import { BookingStatus, Prisma } from '@prisma/client';

/**
 * The one definition of "this row overlaps [from, to)", shared by every story
 * that asks it (US-16 calendar, US-17 availability, US-18 search, US-21/US-23
 * conflicts, US-24 overlap detection), for any table with `start`/`end`
 * columns: bookings and US-16 venue blocks alike.
 *
 * Half-open on both sides: a row ending exactly when the range starts, or
 * starting exactly when it ends, does not overlap. Back-to-back slots are not
 * a conflict.
 *
 * Expressed as a Prisma filter rather than a function over loaded rows, so a
 * caller can embed it in a relation filter (`bookings: { none: ... }`) and
 * have Postgres answer for every venue in one query instead of one per venue.
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
 * US-51 — overlapsRange() for windows already in memory, so the sweep over a
 * venue's bookings needs no query per pair. The same half-open comparison as
 * the filter above (start < other.end and end > other.start); if one changes,
 * change both. test/booking-review-flags.e2e-spec.ts checks they agree with
 * Postgres.
 */
export function windowsOverlap(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date },
): boolean {
  return a.start < b.end && a.end > b.start;
}

/**
 * US-49 — the window a booking actually occupies once the venue's buffers
 * apply: setup time before it, turnaround time after it. The customer's
 * example: 10:00-12:00 with 30/45 minutes occupies 09:30-12:45.
 *
 * Deliberately not an overlap rule. Feed the result to overlapsRange() so
 * there is still exactly one: padded windows that only touch
 * at a boundary do not overlap, the same half-open [start, end) rule.
 *
 * Pure: returns new Dates and never mutates its arguments. Used by US-50
 * (availability and conflict enforcement) and US-51.
 */
export function paddedRange(
  start: Date,
  end: Date,
  setupMinutes: number,
  turnaroundMinutes: number,
): { start: Date; end: Date } {
  const MINUTE = 60_000;
  return {
    start: new Date(start.getTime() - setupMinutes * MINUTE),
    end: new Date(end.getTime() + turnaroundMinutes * MINUTE),
  };
}

/** The statuses that occupy a slot with no expiry: pending and approved. */
const UNEXPIRING_LIVE: BookingStatus[] = [BookingStatus.REQUESTED, BookingStatus.APPROVED];

/**
 * US-54 — is this a hold that still holds its slot? A HELD row whose expiry
 * has passed is free, whether or not the expiry job has released it yet: the
 * clock, not the job, decides (docs/adr/0001-held-hard-blocks-at-db-level.md).
 */
export function isLiveHold(
  booking: { status: BookingStatus; holdExpiresAt: Date | null },
  now: Date = new Date(),
): boolean {
  return (
    booking.status === BookingStatus.HELD &&
    booking.holdExpiresAt !== null &&
    booking.holdExpiresAt > now
  );
}

/** US-54 — does this booking occupy its slot at `now`? (Query form below.) */
export function isLive(
  booking: { status: BookingStatus; holdExpiresAt: Date | null },
  now: Date = new Date(),
): boolean {
  return UNEXPIRING_LIVE.includes(booking.status) || isLiveHold(booking, now);
}

/**
 * US-54 — THE filter for "this booking occupies its slot": pending, approved,
 * or a hold that has not expired. Every conflict, availability, calendar and
 * search query uses it instead of a status list, so an expired hold is free
 * everywhere at once. An OR: combine with other ORs through AND.
 */
export function liveBookingsWhere(now: Date = new Date()): Prisma.VenueBookingWhereInput {
  return {
    OR: [
      { status: { in: UNEXPIRING_LIVE } },
      { status: BookingStatus.HELD, holdExpiresAt: { gt: now } },
    ],
  };
}
