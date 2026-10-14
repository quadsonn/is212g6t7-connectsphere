import { BookingDecisionKind, BookingStatus, EventStatus, Prisma } from '@prisma/client';

/**
 * Statuses that still hold a venue. REJECTED bookings hold nothing — nothing
 * depends on them (US-14) and they block no date (US-17). Shared with US-51's
 * conflict re-check, which must agree on what "live" means.
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
  decisions: {
    orderBy: { createdAt: 'asc' },
    include: { decidedBy: { select: { id: true, name: true, email: true, role: true } } },
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
    };
    if (booking.status === BookingStatus.APPROVED) hardConflicts.push(entry);
    else if (booking.status === BookingStatus.REQUESTED) softConflicts.push(entry);
    // REJECTED holds nothing and is ignored.
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
 * US-23 — THE booking status transitions, the only ones a decision may make
 * (CLAUDE.md §3.4). Creation sets REQUESTED; everything after goes through
 * BookingsService.recordDecision(), which checks this table.
 *
 * AC-7: a DECISION is only possible while the request is pending, so the same
 * request cannot be approved or rejected twice. AC-6: once decided, the only
 * way to change the outcome is a REVERSAL, which is recorded as its own row.
 *
 * AMBIGUOUS: a reversal flips the outcome (approved <-> rejected) rather than
 * reopening the request as pending. The AC does not say which; flipping keeps
 * the decision with the person reversing it instead of returning it to the queue.
 */
export const BOOKING_TRANSITIONS: Readonly<
  Record<BookingDecisionKind, Partial<Record<BookingStatus, readonly BookingStatus[]>>>
> = Object.freeze({
  [BookingDecisionKind.DECISION]: {
    [BookingStatus.REQUESTED]: [BookingStatus.APPROVED, BookingStatus.REJECTED],
  },
  [BookingDecisionKind.REVERSAL]: {
    [BookingStatus.APPROVED]: [BookingStatus.REJECTED],
    [BookingStatus.REJECTED]: [BookingStatus.APPROVED],
  },
  // US-51: resolving a "Conflict - needs review" flag is recorded as a
  // decision but never changes the status, so it permits no transition.
  [BookingDecisionKind.REVIEW_RESOLVED]: {},
});

export function canDecide(
  kind: BookingDecisionKind,
  from: BookingStatus,
  to: BookingStatus,
): boolean {
  return BOOKING_TRANSITIONS[kind][from]?.includes(to) ?? false;
}
