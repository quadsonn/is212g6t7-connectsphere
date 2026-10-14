import { paddedRange, windowsOverlap } from './booking-overlap';

/**
 * US-51 — which bookings on a venue clash once its setup/turnaround buffers
 * apply. Pure functions over bookings already loaded (one query per venue),
 * so they are tested without a database.
 */

/** A booking as the sweep needs it. */
export interface ClashCandidate {
  id: string;
  eventName: string | null;
  start: Date;
  end: Date;
}

export interface Buffers {
  setupMinutes: number;
  turnaroundMinutes: number;
}

/** One side of a clash, as shown to Venue Staff (AC-3). */
export interface ClashParty {
  bookingId: string;
  eventName: string | null;
  start: Date;
  end: Date;
}

/** AC-3 — a booking that would be flagged, and the booking it clashes with. */
export interface BufferClash extends ClashParty {
  clashesWith: ClashParty;
}

/**
 * Every pair of bookings whose padded windows overlap, each pair once.
 *
 * Sorted by padded start, each booking is compared only with those that start
 * before its padded end — once one starts at or after it, no later one can
 * overlap it either. Overlap itself is windowsOverlap(), the shared half-open
 * rule, so windows that only touch do not clash.
 */
export function findClashingPairs(
  bookings: readonly ClashCandidate[],
  buffers: Buffers,
): [ClashCandidate, ClashCandidate][] {
  const padded = bookings
    .map((booking) => ({
      booking,
      window: paddedRange(booking.start, booking.end, buffers.setupMinutes, buffers.turnaroundMinutes),
    }))
    .sort((a, b) => a.window.start.getTime() - b.window.start.getTime());

  const pairs: [ClashCandidate, ClashCandidate][] = [];
  for (let i = 0; i < padded.length; i++) {
    for (let j = i + 1; j < padded.length; j++) {
      if (padded[j].window.start >= padded[i].window.end) break;
      if (windowsOverlap(padded[i].window, padded[j].window)) {
        pairs.push([padded[i].booking, padded[j].booking]);
      }
    }
  }
  return pairs;
}

/** The ids involved in at least one clash under the given buffers. */
export function clashingIds(bookings: readonly ClashCandidate[], buffers: Buffers): Set<string> {
  const ids = new Set<string>();
  for (const [a, b] of findClashingPairs(bookings, buffers)) {
    ids.add(a.id);
    ids.add(b.id);
  }
  return ids;
}

/**
 * AC-1/AC-3 — clashes the proposed buffers would CREATE.
 *
 * A pair that already clashes under the current buffers is not new: two
 * pending requests may legitimately overlap (a US-24 soft conflict), and a
 * buffer change did not cause that. So lowering a buffer never flags anything.
 *
 * AC-2: only bookings that start after `now` are flagged. One already in
 * progress still occupies the venue, so it is reported as the booking a
 * future one clashes with — but it is never flagged itself.
 *
 * One entry per flaggable booking per partner, ordered by start, so both
 * bookings of a future pair are listed, each against the other.
 */
export function newClashes(
  bookings: readonly ClashCandidate[],
  current: Buffers,
  proposed: Buffers,
  now: Date,
): BufferClash[] {
  const key = (a: ClashCandidate, b: ClashCandidate) => [a.id, b.id].sort().join('\u0000');
  const existing = new Set(findClashingPairs(bookings, current).map(([a, b]) => key(a, b)));

  const party = (b: ClashCandidate): ClashParty => ({
    bookingId: b.id,
    eventName: b.eventName,
    start: b.start,
    end: b.end,
  });

  const clashes: BufferClash[] = [];
  for (const [a, b] of findClashingPairs(bookings, proposed)) {
    if (existing.has(key(a, b))) continue;
    if (a.start > now) clashes.push({ ...party(a), clashesWith: party(b) });
    if (b.start > now) clashes.push({ ...party(b), clashesWith: party(a) });
  }

  return clashes.sort(
    (x, y) =>
      x.start.getTime() - y.start.getTime() ||
      x.clashesWith.start.getTime() - y.clashesWith.start.getTime() ||
      x.bookingId.localeCompare(y.bookingId),
  );
}
