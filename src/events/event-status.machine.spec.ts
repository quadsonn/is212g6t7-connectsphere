import { EventStatus } from '@prisma/client';

import {
  ALLOWED_TRANSITIONS,
  ACTIVE_ASSIGNMENT_STATUSES,
  ATTENDEE_VISIBLE_STATUSES,
  buildStatusView,
  canTransition,
  DECIDED_STATUSES,
  EDITABLE_STATUSES,
  isTerminal,
  UNASSIGNED_QUEUE_STATUSES,
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

  // TC-S1-88 · US-11 AC-1 · unit: the status machine (event-status.machine.ts) · fails if a status
  // has no row, or a status could be two things at once
  describe('AC-1: exactly one status, and the table covers them all', () => {
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

  // TC-S1-88 · US-11 AC-3 · unit · fails if an action from US-03 to US-09 could move a request along
  // an edge the stories do not allow
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

    it('allows planning to wait on arrangements or on its safety check', () => {
      expect(
        canTransition(EventStatus.PLANNING, EventStatus.AWAITING_ARRANGEMENTS),
      ).toBe(true);
      expect(
        canTransition(EventStatus.PLANNING, EventStatus.AWAITING_SAFETY_CHECK),
      ).toBe(true);
    });

    it('US-42: confirming arrangements leads to the safety check, never straight to CONFIRMED', () => {
      for (const from of [EventStatus.PLANNING, EventStatus.AWAITING_ARRANGEMENTS]) {
        expect(canTransition(from, EventStatus.AWAITING_SAFETY_CHECK)).toBe(true);
        expect(canTransition(from, EventStatus.CONFIRMED)).toBe(false);
      }
    });

    it('never confirms an event except from a pending safety check', () => {
      const into = ALL.filter((from) =>
        canTransition(from, EventStatus.CONFIRMED),
      );

      expect(into).toEqual([EventStatus.AWAITING_SAFETY_CHECK]);
    });

    it('sends a safety decision to the one status each outcome means', () => {
      const from = EventStatus.AWAITING_SAFETY_CHECK;

      expect(canTransition(from, EventStatus.CONFIRMED)).toBe(true);
      expect(canTransition(from, EventStatus.PLANNING)).toBe(true);
      expect(canTransition(from, EventStatus.SAFETY_REJECTED)).toBe(true);
      expect(canTransition(from, EventStatus.COMPLETED)).toBe(false);
    });

    it('keeps a safety-rejected event blocked: it can only be reworked or abandoned', () => {
      expect(ALLOWED_TRANSITIONS[EventStatus.SAFETY_REJECTED]).toEqual([
        EventStatus.PLANNING,
        EventStatus.CANCELLED,
      ]);
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

      // CONFIRMED (and COMPLETED after it) is reached only through the Safety
      // Officer's approval (requirement change 6).
      expect([...ALL].sort()).toEqual([...reached].sort());
    });
  });

  // TC-S1-89 · US-11 AC-2 · unit: the status view builder · fails if a rejection is shown without
  // its decision and reason
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

  // TC-S1-88 · US-11 AC-3 · unit · fails if the shown status could lag behind the stored one
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

    it('keeps the unassigned queue to submitted requests', () => {
      expect(UNASSIGNED_QUEUE_STATUSES).toEqual([EventStatus.SUBMITTED]);
    });

    it('lets an Attendee reach only a CONFIRMED event', () => {
      // US-02 AC-7: a CONFIRMED event is the only one whose arrangements are
      // settled enough to be an Attendee's to see. Narrowed deliberately so the
      // single-record view can never expose more than the browse list.
      expect(ATTENDEE_VISIBLE_STATUSES).toEqual([EventStatus.CONFIRMED]);
    });

    it('never shows an Attendee anything but a CONFIRMED event', () => {
      for (const hidden of [
        EventStatus.DRAFT,
        EventStatus.SUBMITTED,
        EventStatus.UNDER_REVIEW,
        EventStatus.AWAITING_CLARIFICATION,
        EventStatus.RETURNED,
        EventStatus.REJECTED,
        // Before CONFIRMED: internal planning, not reachable even by direct id.
        EventStatus.APPROVED,
        EventStatus.PLANNING,
        EventStatus.AWAITING_ARRANGEMENTS,
        EventStatus.AWAITING_SAFETY_CHECK,
        // After CONFIRMED: over, or no longer registration-facing.
        EventStatus.COMPLETED,
        EventStatus.CANCELLED,
      ]) {
        expect(ATTENDEE_VISIBLE_STATUSES).not.toContain(hidden);
      }
    });

    it('counts a request as active unless it is a draft or finished', () => {
      for (const status of [
        EventStatus.DRAFT,
        EventStatus.COMPLETED,
        EventStatus.CANCELLED,
        EventStatus.REJECTED,
      ]) {
        expect(ACTIVE_ASSIGNMENT_STATUSES).not.toContain(status);
      }
      // Everything else in the enum is active, so a status added later is
      // not silently dropped from the Lead's view.
      expect(ACTIVE_ASSIGNMENT_STATUSES).toHaveLength(ALL.length - 4);
    });

    it('keeps every rule set inside the enum', () => {
      for (const set of [
        EDITABLE_STATUSES,
        UNASSIGNED_QUEUE_STATUSES,
        ATTENDEE_VISIBLE_STATUSES,
        ACTIVE_ASSIGNMENT_STATUSES,
        DECIDED_STATUSES,
      ]) {
        for (const status of set) {
          expect(ALL).toContain(status);
        }
      }
    });
  });
});
