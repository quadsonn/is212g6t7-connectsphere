import { ConflictException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';

import { assertTransition, BookingAction, canTransition } from './booking-status.machine';

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

  it('assertTransition refuses with 409 and names the statuses', () => {
    expect(() => assertTransition(BookingAction.CONVERT, RELEASED, APPROVED)).toThrow(ConflictException);
    expect(() => assertTransition(BookingAction.CONVERT, RELEASED, APPROVED)).toThrow(/released/);
    expect(() => assertTransition(BookingAction.CONVERT, HELD, APPROVED)).not.toThrow();
  });
});
