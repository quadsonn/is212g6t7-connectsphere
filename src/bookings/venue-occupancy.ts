import { BookingStatus, Prisma } from '@prisma/client';

import { overlapsRange } from './booking-overlap';

/**
 * US-50 — THE buffer-aware occupancy rule (Week 7 change 1).
 *
 * Each venue has a setup time before every booking and a turnaround time
 * after it. A booking occupies its venue for the whole span:
 *
 *   occupied = [start − setupMinutes, end + turnaroundMinutes)
 *
 * e.g. 10:00–12:00 with 30 min setup and 45 min turnaround occupies
 * 09:30–12:45. Every availability, conflict, search and calendar check asks
 * this module, so the rule is written once:
 *
 *  - two bookings at the same venue clash when their occupied windows
 *    overlap — so a request can clash with another booking's setup or
 *    turnaround alone (AC-2);
 *  - a blocked-out period clashes with a booking when it overlaps the
 *    booking's occupied window;
 *  - a venue with no buffers configured uses 0, i.e. the event time alone
 *    (AC-4).
 *
 * Overlap stays half-open, the existing convention (booking-overlap.ts):
 * windows that only touch end-to-start do not clash, so a turnaround ending at
 * 12:45 and the next setup starting at 12:45 is fine.
 *
 * Equipment has no buffers (customer): nothing in equipment/ uses this.
 *
 * Supersedes the earlier clarification that turnaround time did not matter,
 * which was recorded in BookingsService.conflictsFor and the US-24 migration.
 */

export interface TimeWindow {
  start: Date;
  end: Date;
}

export interface VenueBuffers {
  setupMinutes: number;
  turnaroundMinutes: number;
}

export const NO_BUFFERS: VenueBuffers = Object.freeze({ setupMinutes: 0, turnaroundMinutes: 0 });

const MINUTE_MS = 60_000;

/**
 * AC-4 — a venue's buffers, falling back to zero for any not configured.
 * Negative values (refused by a CHECK constraint) are treated as zero too, so
 * an occupied window is never shorter than the event itself.
 */
export function buffersOf(
  venue: { setupMinutes?: number | null; turnaroundMinutes?: number | null } | null | undefined,
): VenueBuffers {
  return {
    setupMinutes: Math.max(0, venue?.setupMinutes ?? 0),
    turnaroundMinutes: Math.max(0, venue?.turnaroundMinutes ?? 0),
  };
}

/** AC-1 — the span a booking occupies its venue for. */
export function occupiedWindow(slot: TimeWindow, buffers: VenueBuffers): TimeWindow {
  return {
    start: new Date(slot.start.getTime() - buffers.setupMinutes * MINUTE_MS),
    end: new Date(slot.end.getTime() + buffers.turnaroundMinutes * MINUTE_MS),
  };
}

/** Half-open overlap: touching end-to-start is not an overlap. */
export function windowsOverlap(a: TimeWindow, b: TimeWindow): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

/** AC-2 — whether two bookings at the same venue clash, buffers included. */
export function bookingsClash(a: TimeWindow, b: TimeWindow, buffers: VenueBuffers): boolean {
  return windowsOverlap(occupiedWindow(a, buffers), occupiedWindow(b, buffers));
}

/** Whether a period (a blocked-out time) overlaps a booking's occupied window. */
export function periodClashesWith(period: TimeWindow, slot: TimeWindow, buffers: VenueBuffers): boolean {
  return windowsOverlap(period, occupiedWindow(slot, buffers));
}

/**
 * AC-2, as a query: bookings at one venue (so sharing its buffers) whose
 * occupied window overlaps the occupied window of `slot`.
 *
 * occupied(B) ∩ occupied(S) ≠ ∅
 *   ⟺ B.start − s < S.end + t  and  S.start − s < B.end + t
 *   ⟺ B.start < S.end + (s + t)  and  B.end > S.start − (s + t)
 *
 * — the plain overlap filter on S widened by s + t either side, so the
 * database can still use the (venueId, start, end) index. Unit-tested against
 * bookingsClash().
 */
export function clashingBookingsWhere(
  slot: TimeWindow,
  buffers: VenueBuffers,
): Prisma.VenueBookingWhereInput {
  const gap = (buffers.setupMinutes + buffers.turnaroundMinutes) * MINUTE_MS;
  return overlapsRange(new Date(slot.start.getTime() - gap), new Date(slot.end.getTime() + gap));
}

/** Blocked-out periods at a venue overlapping the occupied window of `slot`. */
export function clashingBlocksWhere(
  slot: TimeWindow,
  buffers: VenueBuffers,
): { start: { lt: Date }; end: { gt: Date } } {
  const occupied = occupiedWindow(slot, buffers);
  return overlapsRange(occupied.start, occupied.end);
}

/**
 * Bookings at one venue whose occupied window overlaps `period` — a blocked
 * or unavailable period (US-16, US-52), or a calendar range.
 *
 * occupied(B) ∩ P ≠ ∅ ⟺ B.start < P.end + s  and  B.end > P.start − t
 */
export function bookingsOccupyingWhere(
  period: TimeWindow,
  buffers: VenueBuffers,
): Prisma.VenueBookingWhereInput {
  return overlapsRange(
    new Date(period.start.getTime() - buffers.turnaroundMinutes * MINUTE_MS),
    new Date(period.end.getTime() + buffers.setupMinutes * MINUTE_MS),
  );
}

/** A venue as the cross-venue check needs it. */
export interface BufferedVenue {
  id: string;
  setupMinutes?: number | null;
  turnaroundMinutes?: number | null;
}

/**
 * AC-5 — which of these venues are free for `slot`, each judged with its own
 * buffers: no confirmed (APPROVED) booking whose occupied window overlaps the
 * slot's occupied window, and — when asked — no blocked-out period in it.
 *
 * Pending requests never make a venue unavailable, as everywhere else.
 *
 * Buffers differ per venue, so this cannot be one relation filter. Instead it
 * is two queries whatever the number of venues: the bookings (and blocks)
 * near the slot, widened by the largest buffer among them, then the exact
 * per-venue rule in memory.
 */
export async function freeVenueIds(
  db: Prisma.TransactionClient,
  venues: readonly BufferedVenue[],
  slot: TimeWindow,
  options: { includeBlocks: boolean },
): Promise<Set<string>> {
  if (venues.length === 0) return new Set();

  const buffersById = new Map(venues.map((v) => [v.id, buffersOf(v)]));
  const widest: VenueBuffers = {
    setupMinutes: Math.max(...[...buffersById.values()].map((b) => b.setupMinutes)),
    turnaroundMinutes: Math.max(...[...buffersById.values()].map((b) => b.turnaroundMinutes)),
  };
  const venueIds = venues.map((v) => v.id);

  const [bookings, blocks] = await Promise.all([
    db.venueBooking.findMany({
      where: {
        venueId: { in: venueIds },
        status: BookingStatus.APPROVED,
        ...clashingBookingsWhere(slot, widest),
      },
      select: { venueId: true, start: true, end: true },
    }),
    options.includeBlocks
      ? db.venueBlock.findMany({
          where: { venueId: { in: venueIds }, ...clashingBlocksWhere(slot, widest) },
          select: { venueId: true, start: true, end: true },
        })
      : Promise.resolve([]),
  ]);

  const busy = new Set<string>();
  for (const b of bookings) {
    if (bookingsClash(slot, b, buffersById.get(b.venueId) ?? NO_BUFFERS)) busy.add(b.venueId);
  }
  for (const block of blocks) {
    if (periodClashesWith(block, slot, buffersById.get(block.venueId) ?? NO_BUFFERS)) {
      busy.add(block.venueId);
    }
  }

  return new Set(venueIds.filter((id) => !busy.has(id)));
}

/**
 * AC-3 — a booking split into what it occupies: the setup buffer, the event
 * time and the turnaround buffer, as separate segments. A zero-length buffer
 * is left out.
 */
export type OccupancySegmentKind = 'SETUP' | 'EVENT' | 'TURNAROUND';

export interface OccupancySegment {
  kind: OccupancySegmentKind;
  start: Date;
  end: Date;
}

export function occupancySegments(slot: TimeWindow, buffers: VenueBuffers): OccupancySegment[] {
  const occupied = occupiedWindow(slot, buffers);
  return [
    { kind: 'SETUP' as const, start: occupied.start, end: slot.start },
    { kind: 'EVENT' as const, start: slot.start, end: slot.end },
    { kind: 'TURNAROUND' as const, start: slot.end, end: occupied.end },
  ].filter((segment) => segment.end.getTime() > segment.start.getTime());
}
