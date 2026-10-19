import { BookingStatus, Prisma } from '@prisma/client';

import { recheckReviewFlags } from './booking-review.service';
import { assertTransition, BookingAction } from './booking-status.machine';
import { HoldNotifier } from './hold-notifier';

/**
 * US-54 — releasing holds, as plain functions over the caller's transaction
 * so BookingsService, HoldsService and the expiry job share them without
 * depending on each other.
 *
 * See docs/adr/0001-held-hard-blocks-at-db-level.md for why expiry is decided
 * at read time and why these exist anyway.
 */

export const HOLD_EXPIRED_REASON = 'Hold expired';
export const HOLD_RELEASED_BY_STAFF = 'Released by venue staff';
export const HOLD_RELEASED_BY_RESCHEDULE = 'Event rescheduled';

/** How long before expiry the Coordinator and venue manager are warned (AC-7). */
export const HOLD_WARNING_MS = 24 * 60 * 60 * 1000;

/**
 * VenueBooking's times are TIMESTAMP(3) WITHOUT TIME ZONE, holding UTC. A JS
 * Date bound into raw SQL arrives as timestamptz and would be shifted by the
 * session TimeZone on the way to timestamp, so pass the UTC wall time instead.
 */
const utc = (at: Date) => Prisma.sql`CAST(${at.toISOString().slice(0, 23)} AS TIMESTAMP(3))`;

/**
 * AC-6 — release every hold whose expiry has passed (on one venue, or all).
 *
 * One conditional UPDATE ... RETURNING, never a read then a write: the row
 * lock it takes makes a concurrent caller (another instance's job, or a
 * request on the same venue) re-check the WHERE after this commits and find
 * nothing, so each hold is released — and its HOLD_EXPIRED notice sent — by
 * exactly one transaction. Notices are sent only for the rows this call
 * returned, in the same transaction.
 *
 * Expresses BookingAction.EXPIRE (HELD -> RELEASED) in SQL; see
 * booking-status.machine.ts.
 *
 * Callers that insert or approve a booking call it first, under lockVenue:
 * the EXCLUDE constraint covers every HELD row, expired or not.
 */
export async function releaseExpiredHolds(
  tx: Prisma.TransactionClient,
  notifier: HoldNotifier,
  scope: { venueId?: string } = {},
  now: Date = new Date(),
): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string; venueId: string }[]>`
    UPDATE "VenueBooking"
       SET "status" = 'RELEASED',
           "releaseReason" = ${HOLD_EXPIRED_REASON},
           "releasedAt" = ${utc(now)},
           "updatedAt" = ${utc(now)}
     WHERE "status" = 'HELD'
       AND "holdExpiresAt" <= ${utc(now)}
       ${scope.venueId ? Prisma.sql`AND "venueId" = ${scope.venueId}` : Prisma.empty}
    RETURNING "id", "venueId"`;

  for (const { id } of rows) {
    await notifier.expired(tx, id);
  }
  // US-51: a released hold may end other bookings' buffer clashes.
  for (const venueId of new Set(rows.map((r) => r.venueId))) {
    await recheckReviewFlags(venueId, tx, now);
  }
  return rows.map((r) => r.id);
}

/**
 * AC-7 — claim the 24-hour warning for every live hold expiring within a day
 * that has not had one, and send it. Same once-only pattern as above: the
 * UPDATE sets holdWarningSentAt only where it is still null, and only the
 * rows it returns are notified. Extending a hold clears the mark.
 */
export async function sendHoldWarnings(
  tx: Prisma.TransactionClient,
  notifier: HoldNotifier,
  now: Date = new Date(),
): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "VenueBooking"
       SET "holdWarningSentAt" = ${utc(now)},
           "updatedAt" = ${utc(now)}
     WHERE "status" = 'HELD'
       AND "holdExpiresAt" > ${utc(now)}
       AND "holdExpiresAt" <= ${utc(new Date(now.getTime() + HOLD_WARNING_MS))}
       AND "holdWarningSentAt" IS NULL
    RETURNING "id"`;

  for (const { id } of rows) {
    await notifier.expiring(tx, id);
  }
  return rows.map((r) => r.id);
}

/**
 * Release one live hold before its expiry (AC-5 release, and US-38 when the
 * event moves). The caller holds the venue lock and has checked the hold is
 * live. Notifies the Coordinator.
 */
export async function releaseHold(
  tx: Prisma.TransactionClient,
  notifier: HoldNotifier,
  hold: { id: string; venueId: string; status: BookingStatus },
  reason: string,
  now: Date = new Date(),
) {
  assertTransition(BookingAction.RELEASE, hold.status, BookingStatus.RELEASED);

  const released = await tx.venueBooking.update({
    where: { id: hold.id },
    data: { status: BookingStatus.RELEASED, releasedAt: now, releaseReason: reason },
  });
  await notifier.released(tx, hold.id, reason);
  await recheckReviewFlags(hold.venueId, tx, now);
  return released;
}
