import { ConflictException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';

/**
 * THE booking status transitions (CLAUDE.md §3.4) — every write of
 * VenueBooking.status goes through canTransition()/assertTransition().
 *
 * Derived from the code that already wrote statuses before US-54, then
 * extended for holds:
 *
 *   REQUEST     (US-21 createRequest)            new       -> REQUESTED
 *   DECISION    (US-23 recordDecision)           REQUESTED -> APPROVED | REJECTED
 *   REVERSAL    (US-23 recordDecision)           APPROVED <-> REJECTED
 *   REVIEW_RESOLVED (US-51 resolveReview)        no status change
 *   RESCHEDULE  (US-38 rescheduleForEventChange) REQUESTED | APPROVED -> REQUESTED
 *   HOLD        (US-54 place)                    new  -> HELD
 *   CONVERT     (US-54 convert)                  HELD -> APPROVED
 *   RELEASE     (US-54 release, US-38 reschedule) HELD -> RELEASED
 *   EXPIRE      (US-54 expiry)                   HELD -> RELEASED
 *   CANCEL_EVENT (US-44 releaseForCancelledEvent) REQUESTED | APPROVED | HELD -> RELEASED
 *   REBOOK      (US-48 rebookForEventChange)     REQUESTED | APPROVED -> RELEASED
 *   CARRY_APPROVAL (US-48 rebookForEventChange)  REQUESTED -> APPROVED
 *   REPLACE     (US-52 releaseReplaced)          REQUESTED | APPROVED -> RELEASED
 *
 * US-48 rebooks an event's live bookings for a change request's new details:
 * each original is RELEASED (REBOOK) and linked to a new booking, and a new
 * booking whose original was approved takes that approval over
 * (CARRY_APPROVAL) — Venue Staff do not decide again. Since US-48, nothing
 * calls RESCHEDULE: the old in-place move is gone.
 *
 * US-52: once a replacement for a booking whose venue became unavailable is
 * approved, the original is RELEASED (REPLACE) and linked to it.
 *
 * RELEASED and REJECTED hold nothing; only a REVERSAL brings a REJECTED
 * booking back. Nothing leaves RELEASED, so an expired hold can never become
 * a confirmed booking (Week 7 Change #4).
 *
 * EXPIRE is also expressed in SQL by releaseExpiredHolds() (hold-expiry.ts):
 * a conditional bulk UPDATE ... WHERE status = 'HELD' cannot call this
 * function row by row without reading first, which would break its
 * idempotency. Keep the two in step.
 *
 * DECISION, REVERSAL and REVIEW_RESOLVED share their names with
 * BookingDecisionKind, so a decision's kind is its action. (US-44's RELEASE
 * kind records a CANCEL_EVENT; it is not a decision anyone can make.)
 */
export enum BookingAction {
  REQUEST = 'REQUEST',
  DECISION = 'DECISION',
  REVERSAL = 'REVERSAL',
  REVIEW_RESOLVED = 'REVIEW_RESOLVED',
  RESCHEDULE = 'RESCHEDULE',
  HOLD = 'HOLD',
  CONVERT = 'CONVERT',
  RELEASE = 'RELEASE',
  EXPIRE = 'EXPIRE',
  CANCEL_EVENT = 'CANCEL_EVENT',
  REBOOK = 'REBOOK',
  CARRY_APPROVAL = 'CARRY_APPROVAL',
  REPLACE = 'REPLACE',
}

/** `NEW` is the "from" of an action that creates the booking. */
const NEW = 'NEW';
type From = BookingStatus | typeof NEW;

const { REQUESTED, APPROVED, REJECTED, HELD, RELEASED } = BookingStatus;

export const BOOKING_TRANSITIONS: Readonly<
  Record<BookingAction, Partial<Record<From, readonly BookingStatus[]>>>
> = Object.freeze({
  [BookingAction.REQUEST]: { [NEW]: [REQUESTED] },
  [BookingAction.DECISION]: { [REQUESTED]: [APPROVED, REJECTED] },
  [BookingAction.REVERSAL]: { [APPROVED]: [REJECTED], [REJECTED]: [APPROVED] },
  // US-51: recorded as a decision, but never changes the status.
  [BookingAction.REVIEW_RESOLVED]: {},
  [BookingAction.RESCHEDULE]: { [REQUESTED]: [REQUESTED], [APPROVED]: [REQUESTED] },
  [BookingAction.HOLD]: { [NEW]: [HELD] },
  [BookingAction.CONVERT]: { [HELD]: [APPROVED] },
  [BookingAction.RELEASE]: { [HELD]: [RELEASED] },
  [BookingAction.EXPIRE]: { [HELD]: [RELEASED] },
  // US-44 AC-1: whatever the booking was doing — pending, held or confirmed.
  [BookingAction.CANCEL_EVENT]: { [REQUESTED]: [RELEASED], [APPROVED]: [RELEASED], [HELD]: [RELEASED] },
  // US-48 AC-7: the original of a rebooked booking, pending or confirmed.
  [BookingAction.REBOOK]: { [REQUESTED]: [RELEASED], [APPROVED]: [RELEASED] },
  // US-48 AC-7: the new booking inherits its original's approval.
  [BookingAction.CARRY_APPROVAL]: { [REQUESTED]: [APPROVED] },
  // US-52 AC-5: the original, once its replacement is approved.
  [BookingAction.REPLACE]: { [REQUESTED]: [RELEASED], [APPROVED]: [RELEASED] },
});

/** May `action` take a booking from `from` (null: not created yet) to `to`? */
export function canTransition(action: BookingAction, from: BookingStatus | null, to: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[action][from ?? NEW]?.includes(to) ?? false;
}

/** canTransition(), as a 409 naming what was refused. */
export function assertTransition(action: BookingAction, from: BookingStatus | null, to: BookingStatus): void {
  if (!canTransition(action, from, to)) {
    throw new ConflictException(
      from === null
        ? `a booking cannot be created as ${to.toLowerCase()}`
        : `a ${from.toLowerCase()} booking cannot be moved to ${to.toLowerCase()}`,
    );
  }
}
