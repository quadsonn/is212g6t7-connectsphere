import { EventStatus } from '@prisma/client';

import {
  ALLOWED_TRANSITIONS,
  canTransition,
  isTerminal,
} from './event-status.transitions';

/** US-03 — the transition table later stories depend on. */
describe('Event status transitions (US-03)', () => {
  const ALL = Object.values(EventStatus);

  it('covers every status in the enum, so no status is unreachable by omission', () => {
    for (const status of ALL) {
      expect(ALLOWED_TRANSITIONS[status]).toBeDefined();
    }
  });

  describe('the submission path (AC-1)', () => {
    it('allows DRAFT -> SUBMITTED', () => {
      expect(canTransition(EventStatus.DRAFT, EventStatus.SUBMITTED)).toBe(true);
    });

    it('refuses to skip review: DRAFT -> APPROVED', () => {
      expect(canTransition(EventStatus.DRAFT, EventStatus.APPROVED)).toBe(false);
    });

    it('refuses DRAFT -> CONFIRMED', () => {
      expect(canTransition(EventStatus.DRAFT, EventStatus.CONFIRMED)).toBe(false);
    });
  });

  describe('review outcomes', () => {
    it('allows SUBMITTED -> UNDER_REVIEW, APPROVED and REJECTED', () => {
      expect(canTransition(EventStatus.SUBMITTED, EventStatus.UNDER_REVIEW)).toBe(true);
      expect(canTransition(EventStatus.SUBMITTED, EventStatus.APPROVED)).toBe(true);
      expect(canTransition(EventStatus.SUBMITTED, EventStatus.REJECTED)).toBe(true);
    });

    it('returns a request rather than demoting it to DRAFT (US-08)', () => {
      expect(canTransition(EventStatus.UNDER_REVIEW, EventStatus.RETURNED)).toBe(true);
      // US-08 replaced the old "clarification sends it back to DRAFT" edge.
      expect(canTransition(EventStatus.UNDER_REVIEW, EventStatus.DRAFT)).toBe(false);
    });

    it('allows a returned request to be resubmitted', () => {
      expect(canTransition(EventStatus.RETURNED, EventStatus.SUBMITTED)).toBe(true);
    });

    it('does not allow a returned request to skip review', () => {
      expect(canTransition(EventStatus.RETURNED, EventStatus.APPROVED)).toBe(false);
    });

    it('does not allow a submitted request to jump straight to CONFIRMED', () => {
      expect(canTransition(EventStatus.SUBMITTED, EventStatus.CONFIRMED)).toBe(false);
    });
  });

  describe('terminal states', () => {
    it('treats COMPLETED and CANCELLED as terminal', () => {
      expect(isTerminal(EventStatus.COMPLETED)).toBe(true);
      expect(isTerminal(EventStatus.CANCELLED)).toBe(true);
    });

    it('allows nothing out of a terminal state', () => {
      for (const target of ALL) {
        expect(canTransition(EventStatus.COMPLETED, target)).toBe(false);
        expect(canTransition(EventStatus.CANCELLED, target)).toBe(false);
      }
    });

    it('does not treat any working status as terminal', () => {
      for (const status of [
        EventStatus.DRAFT,
        EventStatus.SUBMITTED,
        EventStatus.UNDER_REVIEW,
        EventStatus.RETURNED,
        EventStatus.APPROVED,
        EventStatus.PLANNING,
        EventStatus.CONFIRMED,
      ]) {
        expect(isTerminal(status)).toBe(false);
      }
    });
  });

  it('allows cancellation from every non-terminal status', () => {
    for (const status of [
      EventStatus.DRAFT,
      EventStatus.SUBMITTED,
      EventStatus.UNDER_REVIEW,
      EventStatus.RETURNED,
      EventStatus.APPROVED,
      EventStatus.PLANNING,
      EventStatus.CONFIRMED,
    ]) {
      expect(canTransition(status, EventStatus.CANCELLED)).toBe(true);
    }
  });

  it('never lists a transition to itself', () => {
    for (const status of ALL) {
      expect(ALLOWED_TRANSITIONS[status]).not.toContain(status);
    }
  });

  it('is frozen, so edges cannot be added at runtime', () => {
    expect(Object.isFrozen(ALLOWED_TRANSITIONS)).toBe(true);
  });
});
