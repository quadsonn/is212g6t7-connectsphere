import { BookingDecisionKind, BookingStatus, EventStatus, Prisma } from '@prisma/client';

import { BookingAction, canTransition } from './booking-status.machine';

/**
 * Statuses that still hold a venue with no expiry. REJECTED and RELEASED hold
 * nothing — nothing depends on them (US-14) and they block no date (US-17).
 *
 * US-54: a HELD booking is live only until its expiry, which a status list
 * cannot say. Queries use liveBookingsWhere(now) and in-memory checks use
 * isLive() (booking-overlap.ts); this list is what those build on, and what
 * classifies a pending request as soft.
 */
export const LIVE_STATUSES: BookingStatus[] = [
  BookingStatus.REQUESTED,
  BookingStatus.APPROVED,
];

/**
 * US-21 — event statuses in which a Coordinator may request a venue.
 *
 * AMBIGUOUS: the brief says review precedes venue booking (§1), so nothing
 * before APPROVED qualifies. CONFIRMED is excluded because a confirmed event
 * already has its arrangements; changing a venue then is a change request
 * (E8), not a fresh booking.
 */
export const BOOKABLE_EVENT_STATUSES: readonly EventStatus[] = [
  EventStatus.APPROVED,
  EventStatus.PLANNING,
  EventStatus.AWAITING_ARRANGEMENTS,
];

/**
 * US-41 — one suggested alternative as it is shown: the venue, and the request
 * created from it once the Coordinator accepted it (AC-6).
 */
export const SUGGESTION_SELECT = {
  id: true,
  venue: { select: { id: true, name: true, location: true, capacity: true } },
  acceptedBookingId: true,
  acceptedAt: true,
  createdAt: true,
} as const satisfies Prisma.BookingSuggestionSelect;

/** The relations every booking read carries, so callers never see bare ids. */
export const BOOKING_INCLUDE = {
  venue: { select: { id: true, name: true, location: true, capacity: true } },
  event: {
    select: {
      id: true,
      name: true,
      status: true,
      organiser: { select: { id: true, name: true, email: true } },
    },
  },
  requestedBy: { select: { id: true, name: true, email: true } },
  // US-23 AC-4/AC-5: the full decision history, oldest first, attributed.
  // US-41 AC-5/AC-7: each decision with the alternatives attached to it.
  decisions: {
    orderBy: { createdAt: 'asc' },
    include: {
      decidedBy: { select: { id: true, name: true, email: true, role: true } },
      suggestions: {
        orderBy: { createdAt: 'asc' },
        select: SUGGESTION_SELECT,
      },
    },
  },
} as const satisfies Prisma.VenueBookingInclude;

export type BookingView = Prisma.VenueBookingGetPayload<{
  include: typeof BOOKING_INCLUDE;
}>;

/**
 * US-21 AC-4/AC-5 — something already occupying the requested slot: an
 * existing booking, or (US-16) a period Venue Staff have blocked out.
 *
 * Event name and times only: enough for the Coordinator to see what is in the
 * way, without exposing another event's organiser or internal planning data.
 */
export interface BookingConflict {
  kind: 'BOOKING' | 'BLOCK';
  /** Set for kind BOOKING. */
  bookingId: string | null;
  /** Set for kind BLOCK. */
  blockId?: string;
  eventName: string | null;
  /** Why the time is blocked, for kind BLOCK. */
  reason?: string;
  start: Date;
  end: Date;
  /** A BookingStatus, or BLOCKED. */
  status: string;
}

/** US-21 AC-5 — submission succeeded, but someone else is also asking. */
export interface BookingWarning {
  code: 'OVERLAPS_PENDING_REQUEST';
  message: string;
  conflicts: BookingConflict[];
}

export type BookingRequestResult = BookingView & { warnings: BookingWarning[] };

/**
 * US-24 — an overlapping booking, as Venue Staff see it. Unlike the
 * Coordinator-facing calendar (US-17), the event is named: AC-4 requires
 * showing which booking is in the way.
 */
export interface OverlappingBooking {
  bookingId: string;
  eventName: string | null;
  start: Date;
  end: Date;
  /** US-54: APPROVED or HELD (hard), REQUESTED (soft). */
  status: BookingStatus;
}

/** US-24 — a blocked-out period (US-16) overlapping the booking. */
export interface OverlappingBlock {
  blockId: string;
  reason: string;
  start: Date;
  end: Date;
}

/**
 * US-24 AC-2/AC-3 — every overlap on the venue, hard and soft kept apart.
 *
 * Hard: APPROVED bookings and blocked-out periods — approval is refused.
 * Soft: REQUESTED (pending) bookings — a warning only, never a block.
 * REJECTED bookings and the booking being checked are never listed.
 */
export interface BookingConflictReport {
  hardConflicts: OverlappingBooking[];
  softConflicts: OverlappingBooking[];
  blocks: OverlappingBlock[];
  hasHardConflict: boolean;
}

/** The 409 body for a hard conflict, from the app check or the database. */
export const HARD_CONFLICT_CODE = 'BOOKING_HARD_CONFLICT';

/** A decision's result: the booking, plus any soft-conflict warnings (US-24 AC-3). */
export type BookingDecisionResult = BookingView & { warnings: BookingWarning[] };

/**
 * US-24 — sort overlapping rows into hard and soft. Pure, so the rules are
 * unit-testable; the overlap itself is decided by the query (booking-overlap.ts).
 */
export function classifyConflicts(
  selfId: string | null,
  bookings: { id: string; status: BookingStatus; eventName: string | null; start: Date; end: Date }[],
  blocks: OverlappingBlock[],
): BookingConflictReport {
  const hardConflicts: OverlappingBooking[] = [];
  const softConflicts: OverlappingBooking[] = [];

  for (const booking of bookings) {
    // AC: a booking never conflicts with itself.
    if (booking.id === selfId) continue;

    const entry = {
      bookingId: booking.id,
      eventName: booking.eventName,
      start: booking.start,
      end: booking.end,
      status: booking.status,
    };
    // US-54 AC-3: a hold hard-blocks like an approved booking. Callers pass
    // only live rows (liveBookingsWhere), so a HELD one here has not expired.
    if (booking.status === BookingStatus.APPROVED || booking.status === BookingStatus.HELD) {
      hardConflicts.push(entry);
    } else if (booking.status === BookingStatus.REQUESTED) softConflicts.push(entry);
    // REJECTED and RELEASED hold nothing and are ignored.
  }

  return {
    hardConflicts,
    softConflicts,
    blocks,
    hasHardConflict: hardConflicts.length > 0 || blocks.length > 0,
  };
}

/**
 * US-22 AC-5 — a pending request whose event starts within this many days is
 * flagged and moved to the top of the queue.
 *
 * AMBIGUOUS: the AC says "nearing their event date" without a number. Seven
 * days follows the team's comment on the story ("put at the top if less than
 * a week remaining"); confirm with the customer.
 */
export const URGENT_WINDOW_DAYS = 7;

/** US-22 — one queue entry: the full request plus its urgency. */
export type BookingQueueEntry = BookingView & {
  /** AC-5: pending, and the event starts within URGENT_WINDOW_DAYS (or has started). */
  urgent: boolean;
  /** Whole days until the booking starts; negative once it has started. */
  daysUntilStart: number;
};

/**
 * US-23 — may a decision of this kind make this change? The table itself now
 * lives in booking-status.machine.ts with every other booking transition; a
 * decision's kind is its action there.
 */
export function canDecide(
  kind: BookingDecisionKind,
  from: BookingStatus,
  to: BookingStatus,
): boolean {
  // US-44: RELEASE is recorded by the system on cancellation, never decided.
  if (kind === BookingDecisionKind.RELEASE) return false;
  return canTransition(kind as unknown as BookingAction, from, to);
}
