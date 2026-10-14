import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingDecisionKind, Prisma } from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { PrismaService } from '../prisma/prisma.service';
import { BOOKING_INCLUDE, BookingView, LIVE_STATUSES } from './booking.types';
import { BufferClash, Buffers, ClashCandidate, clashingIds, newClashes } from './buffer-clashes';
import { lockVenue } from './venue-lock';

/**
 * US-51 — "Conflict - needs review".
 *
 * Week 7 Customer Change #1: bookings that become problematic under new
 * buffers are identified, never silently removed. So everything here touches
 * only the review fields — never a booking's start, end or status (AC-6).
 *
 * Every write here expects the caller to hold the venue lock (lockVenue) in
 * the transaction it passes, except resolveReview, which takes it itself.
 */
@Injectable()
export class BookingReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
  ) {}

  /**
   * AC-1/AC-3 — the clashes `proposed` would create on this venue. Reads
   * only: one query for the venue's live bookings that have not finished,
   * then the in-memory sweep (buffer-clashes.ts).
   */
  async previewBufferChange(
    db: Prisma.TransactionClient,
    venueId: string,
    current: Buffers,
    proposed: Buffers,
    now: Date = new Date(),
  ): Promise<BufferClash[]> {
    const bookings = await loadUnfinishedLive(db, venueId, now);
    return newClashes(bookings, current, proposed, now);
  }

  /**
   * AC-5 — mark each clashing booking "Conflict - needs review", naming what
   * it clashes with. Returns how many bookings were flagged.
   *
   * Re-flagging an already flagged (or previously resolved) booking replaces
   * the reason and clears the old resolution: it is a new problem.
   */
  async flag(
    db: Prisma.TransactionClient,
    clashes: readonly BufferClash[],
    buffers: Buffers,
    now: Date = new Date(),
  ): Promise<number> {
    const byBooking = new Map<string, BufferClash[]>();
    for (const clash of clashes) {
      byBooking.set(clash.bookingId, [...(byBooking.get(clash.bookingId) ?? []), clash]);
    }

    for (const [bookingId, own] of byBooking) {
      const partners = own
        .map(({ clashesWith: w }) => `"${w.eventName ?? 'Untitled event'}" (${slot(w.start, w.end)})`)
        .join(', ');

      await db.venueBooking.update({
        where: { id: bookingId },
        data: {
          needsReview: true,
          needsReviewReason:
            `Clashes with ${partners} under ${buffers.setupMinutes}/${buffers.turnaroundMinutes} min ` +
            'setup/turnaround buffers.',
          flaggedAt: now,
          reviewResolvedAt: null,
          reviewResolvedById: null,
        },
      });
    }

    return byBooking.size;
  }

  /** Automatic resolution — see recheckReviewFlags() below. */
  recheckReviewFlags(
    venueId: string,
    db: Prisma.TransactionClient = this.prisma,
    now: Date = new Date(),
  ): Promise<string[]> {
    return recheckReviewFlags(venueId, db, now);
  }

  /**
   * Manual resolution by the Venue Staff member managing the venue. Clears the
   * flag and records who and why as a BookingDecision (REVIEW_RESOLVED), so
   * the booking's history stays complete. The status is left as it was.
   *
   * A booking on a venue the caller does not manage reads as not found, like
   * every other booking decision (findDecidable).
   */
  async resolveReview(
    user: AuthenticatedUser,
    id: string,
    note: string | null,
    now: Date = new Date(),
  ): Promise<BookingView> {
    this.access.requireScope(user, Resource.BOOKING, Action.DECIDE);

    const booking = await this.prisma.venueBooking.findFirst({
      where: { id, venue: { managedById: user.userId } },
    });
    if (!booking) {
      throw new NotFoundException('booking request not found');
    }

    return this.prisma.$transaction(async (tx) => {
      await lockVenue(tx, booking.venueId);

      // Re-read under the lock: it may have been cleared since.
      const current = await tx.venueBooking.findFirst({ where: { id } });
      if (!current?.needsReview) {
        throw new ConflictException('this booking is not flagged for review');
      }

      const updated = await tx.venueBooking.update({
        where: { id },
        data: { needsReview: false, reviewResolvedAt: now, reviewResolvedById: user.userId },
        include: BOOKING_INCLUDE,
      });

      await tx.bookingDecision.create({
        data: {
          bookingId: id,
          decidedById: user.userId,
          kind: BookingDecisionKind.REVIEW_RESOLVED,
          outcome: current.status,
          reason: note?.trim() || null,
        },
      });

      return updated;
    });
  }
}

/**
 * Automatic resolution — clear the flag on every booking on this venue that
 * no longer clashes with anything under the venue's CURRENT buffers, or is no
 * longer live (rejected, or finished). Never sets a flag.
 *
 * A plain function so any flow that changes a venue's bookings can call it
 * inside its own transaction without depending on this service. Called after
 * a buffer save (VenuesService.updateBuffers), a rejection or a reversal to
 * rejected (BookingsService.recordDecision) and a US-38 reschedule
 * (BookingsService.rescheduleForEventChange). US-44 and US-54 should call it
 * when they release or expire a booking. The caller should hold the venue
 * lock.
 *
 * Returns the ids it cleared.
 */
export async function recheckReviewFlags(
  venueId: string,
  db: Prisma.TransactionClient,
  now: Date = new Date(),
): Promise<string[]> {
  const flagged = await db.venueBooking.findMany({
    where: { venueId, needsReview: true },
    select: { id: true, status: true },
  });
  if (flagged.length === 0) return [];

  const buffers = await db.venue.findUniqueOrThrow({
    where: { id: venueId },
    select: { setupMinutes: true, turnaroundMinutes: true },
  });
  const live = await loadUnfinishedLive(db, venueId, now);
  const stillClashing = clashingIds(live, buffers);

  const cleared = flagged
    .filter((b) => !LIVE_STATUSES.includes(b.status) || !stillClashing.has(b.id))
    .map((b) => b.id);

  if (cleared.length > 0) {
    await db.venueBooking.updateMany({
      where: { id: { in: cleared } },
      data: { needsReview: false, reviewResolvedAt: now, reviewResolvedById: null },
    });
  }
  return cleared;
}

/** Live bookings on the venue that have not finished (end > now), in one query. */
async function loadUnfinishedLive(
  db: Prisma.TransactionClient,
  venueId: string,
  now: Date,
): Promise<ClashCandidate[]> {
  const rows = await db.venueBooking.findMany({
    where: { venueId, status: { in: LIVE_STATUSES }, end: { gt: now } },
    select: { id: true, start: true, end: true, event: { select: { name: true } } },
    orderBy: { start: 'asc' },
  });
  return rows.map((r) => ({ id: r.id, start: r.start, end: r.end, eventName: r.event.name }));
}


/** "2030-10-01 12:30-14:00 UTC" — times are stored without a zone (UTC). */
function slot(start: Date, end: Date): string {
  const iso = (d: Date) => d.toISOString().slice(0, 16).replace('T', ' ');
  const sameDay = start.toISOString().slice(0, 10) === end.toISOString().slice(0, 10);
  return `${iso(start)}–${sameDay ? end.toISOString().slice(11, 16) : iso(end)} UTC`;
}
