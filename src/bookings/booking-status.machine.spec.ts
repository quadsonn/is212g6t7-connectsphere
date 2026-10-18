import { ConflictException } from '@nestjs/common';
import { BookingDecisionKind, BookingStatus } from '@prisma/client';

import { assertTransition, BookingAction, canTransition } from './booking-status.machine';
import { canDecide } from './booking.types';

const { REQUESTED, APPROVED, REJECTED, HELD, RELEASED } = BookingStatus;
const ALL = [REQUESTED, APPROVED, REJECTED, HELD, RELEASED];

/** Every allowed (action, from, to); everything else must be refused. */
const ALLOWED: [BookingAction, BookingStatus, BookingStatus][] = [
  // US-23, unchanged.
  [BookingAction.DECISION, REQUESTED, APPROVED],
  [BookingAction.DECISION, REQUESTED, REJECTED],
  [BookingAction.REVERSAL, APPROVED, REJECTED],
  [BookingAction.REVERSAL, REJECTED, APPROVED],
  // US-38, made explicit.
  [BookingAction.RESCHEDULE, REQUESTED, REQUESTED],
  [BookingAction.RESCHEDULE, APPROVED, REQUESTED],
  // US-54.
  [BookingAction.CONVERT, HELD, APPROVED],
  [BookingAction.RELEASE, HELD, RELEASED],
  [BookingAction.EXPIRE, HELD, RELEASED],
  // US-44.
  [BookingAction.CANCEL_EVENT, REQUESTED, RELEASED],
  [BookingAction.CANCEL_EVENT, APPROVED, RELEASED],
  [BookingAction.CANCEL_EVENT, HELD, RELEASED],
  // US-48 AC-7: a rebooked original is released; its new booking keeps an approval.
  [BookingAction.REBOOK, REQUESTED, RELEASED],
  [BookingAction.REBOOK, APPROVED, RELEASED],
  [BookingAction.CARRY_APPROVAL, REQUESTED, APPROVED],
  // US-52 AC-5: the original, once its replacement is approved.
  [BookingAction.REPLACE, REQUESTED, RELEASED],
  [BookingAction.REPLACE, APPROVED, RELEASED],
];

describe('booking status machine', () => {
  describe.each(Object.values(BookingAction))('%s', (action) => {
    it.each(ALL.flatMap((from) => ALL.map((to) => [from, to] as const)))('%s -> %s', (from, to) => {
      const allowed = ALLOWED.some(([a, f, t]) => a === action && f === from && t === to);
      expect(canTransition(action, from, to)).toBe(allowed);
    });
  });

  it('US-54: a hold can only be created as HELD, and a request only as REQUESTED', () => {
    expect(canTransition(BookingAction.HOLD, null, HELD)).toBe(true);
    expect(canTransition(BookingAction.HOLD, null, APPROVED)).toBe(false);
    expect(canTransition(BookingAction.REQUEST, null, REQUESTED)).toBe(true);
    expect(canTransition(BookingAction.REQUEST, null, HELD)).toBe(false);
  });

  it('US-54: nothing leaves RELEASED — a released or expired hold is never confirmed', () => {
    for (const action of Object.values(BookingAction)) {
      for (const to of ALL) expect(canTransition(action, RELEASED, to)).toBe(false);
    }
  });

  it('US-48 AC-7: a rebook releases the original and carries an approval over, never anything else', () => {
    expect(canTransition(BookingAction.REBOOK, APPROVED, RELEASED)).toBe(true);
    expect(canTransition(BookingAction.REBOOK, HELD, RELEASED)).toBe(false); // US-54: holds are released, not rebooked
    expect(canTransition(BookingAction.CARRY_APPROVAL, REQUESTED, APPROVED)).toBe(true);
    expect(canTransition(BookingAction.CARRY_APPROVAL, REJECTED, APPROVED)).toBe(false);
  });

  it('US-52 AC-5: a replaced booking is released only from a live status', () => {
    expect(canTransition(BookingAction.REPLACE, APPROVED, RELEASED)).toBe(true);
    expect(canTransition(BookingAction.REPLACE, REJECTED, RELEASED)).toBe(false);
    expect(canTransition(BookingAction.REPLACE, RELEASED, RELEASED)).toBe(false);
  });

  it('assertTransition refuses with 409 and names the statuses', () => {
    expect(() => assertTransition(BookingAction.CONVERT, RELEASED, APPROVED)).toThrow(ConflictException);
    expect(() => assertTransition(BookingAction.CONVERT, RELEASED, APPROVED)).toThrow(/released/);
    expect(() => assertTransition(BookingAction.CONVERT, HELD, APPROVED)).not.toThrow();
  });
});

describe('US-44: RELEASE is not a decision', () => {
  it('US-44: no one can decide a RELEASE, from any status', () => {
    for (const from of ALL) {
      for (const to of ALL) expect(canDecide(BookingDecisionKind.RELEASE, from, to)).toBe(false);
    }
  });
});
