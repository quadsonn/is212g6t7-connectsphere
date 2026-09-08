import { EventStatus } from '@prisma/client';

import {
  ALLOWED_TRANSITIONS,
  ASSIGNABLE_STATUSES,
  ATTENDEE_VISIBLE_STATUSES,
  buildStatusView,
  canTransition,
  COORDINATOR_POOL_STATUSES,
  DECIDED_STATUSES,
  EDITABLE_STATUSES,
  isTerminal,
} from './event-status.machine';

/** US-11 — the consolidated state machine. */
describe('Event state machine (US-11)', () => {
  const ALL = Object.values(EventStatus);

  const record = (overrides: Record<string, unknown> = {}) => ({
    status: EventStatus.SUBMITTED,
    decisionReason: null,
    clarificationRequest: null,
    ...overrides,
  }) as never;

  describe('AC-1: exactly one status, and the table covers them all', () => {
    it('has an entry for every status in the enum', () => {
      for (const status of ALL) {
        expect(ALLOWED_TRANSITIONS[status]).toBeDefined();
      }
    });

    it('covers the ten statuses the acceptance criteria enumerate', () => {
      for (const status of [
        EventStatus.DRAFT,
        EventStatus.SUBMITTED,
        EventStatus.UNDER_REVIEW,
        EventStatus.APPROVED,
        EventStatus.PLANNING,
        EventStatus.AWAITING_ARRANGEMENTS,
        EventStatus.CONFIRMED,
        EventStatus.COMPLETED,
        EventStatus.CANCELLED,
        EventStatus.REJECTED,
      ]) {
        expect(ALL).toContain(status);
      }
    });

    it('also carries the two statuses AC-2 and AC-3 imply', () => {
      // AC-1 omits these, but AC-2 speaks of a returned request and AC-3 of a
      // clarification. See the US-11 summary.
      expect(ALL).toContain(EventStatus.RETURNED);
      expect(ALL).toContain(EventStatus.AWAITING_CLARIFICATION);
    });

    it('reports exactly one status per record', () => {
      const view = buildStatusView(record({ status: EventStatus.PLANNING }));
      expect(view.status).toBe(EventStatus.PLANNING);
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

  describe('transition rules gathered from US-03..US-09', () => {
    it('allows the submission path', () => {
      expect(canTransition(EventStatus.DRAFT, EventStatus.SUBMITTED)).toBe(true);
    });

    it('forbids skipping review', () => {
      expect(canTransition(EventStatus.DRAFT, EventStatus.APPROVED)).toBe(false);
      expect(canTransition(EventStatus.DRAFT, EventStatus.CONFIRMED)).toBe(false);
    });

    it('allows every review outcome from SUBMITTED', () => {
      for (const outcome of [
        EventStatus.UNDER_REVIEW,
        EventStatus.APPROVED,
        EventStatus.AWAITING_CLARIFICATION,
        EventStatus.RETURNED,
        EventStatus.REJECTED,
      ]) {
        expect(canTransition(EventStatus.SUBMITTED, outcome)).toBe(true);
      }
    });

    it('sends an answered clarification back to review, not to approval', () => {
      expect(
        canTransition(EventStatus.AWAITING_CLARIFICATION, EventStatus.UNDER_REVIEW),
      ).toBe(true);
      expect(
        canTransition(EventStatus.AWAITING_CLARIFICATION, EventStatus.APPROVED),
      ).toBe(false);
    });

    it('lets a returned request be resubmitted but not self-approved', () => {
      expect(canTransition(EventStatus.RETURNED, EventStatus.SUBMITTED)).toBe(true);
      expect(canTransition(EventStatus.RETURNED, EventStatus.APPROVED)).toBe(false);
    });

    it('routes approved work through planning', () => {
      expect(canTransition(EventStatus.APPROVED, EventStatus.PLANNING)).toBe(true);
      expect(canTransition(EventStatus.APPROVED, EventStatus.CONFIRMED)).toBe(false);
    });

    it('allows planning to wait on arrangements or confirm directly', () => {
      expect(
        canTransition(EventStatus.PLANNING, EventStatus.AWAITING_ARRANGEMENTS),
      ).toBe(true);
      expect(canTransition(EventStatus.PLANNING, EventStatus.CONFIRMED)).toBe(true);
    });

    it('lets a refused arrangement send planning back round', () => {
      expect(
        canTransition(EventStatus.AWAITING_ARRANGEMENTS, EventStatus.PLANNING),
      ).toBe(true);
    });

    it('allows cancellation from every non-terminal status', () => {
      for (const status of ALL.filter((s) => !isTerminal(s) && s !== EventStatus.REJECTED)) {
        expect(canTransition(status, EventStatus.CANCELLED)).toBe(true);
      }
    });

    it('treats COMPLETED and CANCELLED as terminal', () => {
      expect(isTerminal(EventStatus.COMPLETED)).toBe(true);
      expect(isTerminal(EventStatus.CANCELLED)).toBe(true);

      for (const target of ALL) {
        expect(canTransition(EventStatus.COMPLETED, target)).toBe(false);
        expect(canTransition(EventStatus.CANCELLED, target)).toBe(false);
      }
    });

    it('leaves every working status non-terminal', () => {
      for (const status of ALL.filter(
        (s) => s !== EventStatus.COMPLETED && s !== EventStatus.CANCELLED,
      )) {
        expect(isTerminal(status)).toBe(false);
      }
    });

    it('makes every status reachable from DRAFT', () => {
      // Guards against a status that can be declared but never entered.
      const reached = new Set<EventStatus>([EventStatus.DRAFT]);
      const queue: EventStatus[] = [EventStatus.DRAFT];

      while (queue.length > 0) {
        for (const next of ALLOWED_TRANSITIONS[queue.shift()!]) {
          if (!reached.has(next)) {
            reached.add(next);
            queue.push(next);
          }
        }
      }

      expect([...ALL].sort()).toEqual([...reached].sort());
    });
  });

  describe('AC-2: a decision is shown with its reason', () => {
    it('reports a rejection with its reason', () => {
      const view = buildStatusView(
        record({
          status: EventStatus.REJECTED,
          decisionReason: 'Clashes with the examination period',
        }),
      );

      expect(view.decision).toEqual({
        outcome: EventStatus.REJECTED,
        reason: 'Clashes with the examination period',
      });
    });

    it('reports a return with the reason it was returned for', () => {
      const view = buildStatusView(
        record({
          status: EventStatus.RETURNED,
          clarificationRequest: 'Please confirm the attendance figure',
        }),
      );

      expect(view.decision).toEqual({
        outcome: EventStatus.RETURNED,
        reason: 'Please confirm the attendance figure',
      });
    });

    it('hides the split between the two reason fields from callers', () => {
      const rejected = buildStatusView(
        record({ status: EventStatus.REJECTED, decisionReason: 'No' }),
      );
      const returned = buildStatusView(
        record({ status: EventStatus.RETURNED, clarificationRequest: 'More detail' }),
      );

      // Same shape, despite coming from different columns.
      expect(Object.keys(rejected.decision!)).toEqual(Object.keys(returned.decision!));
    });

    it('reports no decision for a status that is not one', () => {
      for (const status of ALL.filter((s) => !DECIDED_STATUSES.includes(s))) {
        expect(buildStatusView(record({ status })).decision).toBeNull();
      }
    });

    it('still reports the decision when the reason is somehow absent', () => {
      const view = buildStatusView(record({ status: EventStatus.REJECTED }));

      expect(view.decision).toEqual({
        outcome: EventStatus.REJECTED,
        reason: null,
      });
    });

    it('flags an outstanding clarification', () => {
      expect(
        buildStatusView(
          record({
            status: EventStatus.AWAITING_CLARIFICATION,
            clarificationRequest: 'Q?',
          }),
        ).clarificationRequested,
      ).toBe(true);

      expect(buildStatusView(record()).clarificationRequested).toBe(false);
    });
  });

  describe('AC-3: the view is derived, never cached', () => {
    it('reflects whatever the record currently holds', () => {
      const before = buildStatusView(record({ status: EventStatus.SUBMITTED }));
      const after = buildStatusView(record({ status: EventStatus.APPROVED }));

      expect(before.status).toBe(EventStatus.SUBMITTED);
      expect(after.status).toBe(EventStatus.APPROVED);
    });

    it('returns a fresh object each time, so nothing can be mutated in place', () => {
      const input = record({ status: EventStatus.APPROVED });
      expect(buildStatusView(input)).not.toBe(buildStatusView(input));
    });
  });

  describe('the rule sets other stories read', () => {
    it('keeps editing to statuses still in the Organiser’s hands', () => {
      expect(EDITABLE_STATUSES).toEqual([EventStatus.DRAFT, EventStatus.RETURNED]);
    });

    it('keeps the unassigned pool to statuses awaiting first review', () => {
      expect(COORDINATOR_POOL_STATUSES).toEqual([
        EventStatus.SUBMITTED,
        EventStatus.UNDER_REVIEW,
      ]);
    });

    it('never shows an Attendee a request still under review', () => {
      for (const hidden of [
        EventStatus.DRAFT,
        EventStatus.SUBMITTED,
        EventStatus.UNDER_REVIEW,
        EventStatus.AWAITING_CLARIFICATION,
        EventStatus.RETURNED,
        EventStatus.REJECTED,
        EventStatus.CANCELLED,
      ]) {
        expect(ATTENDEE_VISIBLE_STATUSES).not.toContain(hidden);
      }
    });

    it('never allows assignment on a draft or a terminal request', () => {
      for (const status of [
        EventStatus.DRAFT,
        EventStatus.COMPLETED,
        EventStatus.CANCELLED,
        EventStatus.REJECTED,
      ]) {
        expect(ASSIGNABLE_STATUSES).not.toContain(status);
      }
    });

    it('keeps every rule set inside the enum', () => {
      for (const set of [
        EDITABLE_STATUSES,
        COORDINATOR_POOL_STATUSES,
        ATTENDEE_VISIBLE_STATUSES,
        ASSIGNABLE_STATUSES,
        DECIDED_STATUSES,
      ]) {
        for (const status of set) {
          expect(ALL).toContain(status);
        }
      }
    });
  });
});
