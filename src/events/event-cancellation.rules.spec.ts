import { EventStatus } from '@prisma/client';

import { isChangeable } from './change-request.rules';
import {
  CANCELLABLE_STATUSES,
  evaluateCancellation,
} from './event-cancellation.rules';
import { EDITABLE_STATUSES, PLANNING_STATUSES } from './event-status.machine';
import { evaluateRegistration } from '../registrations/registration-rules';

/** US-43 — Organiser cancels an event. */
describe('event cancellation rules (US-43)', () => {
  const now = new Date('2030-06-01T09:00:00Z');
  const future = new Date('2030-06-10T09:00:00Z');

  describe('AC-1: cancellable from submitted up to before the event starts', () => {
    it.each([
      EventStatus.SUBMITTED,
      EventStatus.UNDER_REVIEW,
      EventStatus.AWAITING_CLARIFICATION,
      EventStatus.RETURNED,
      EventStatus.APPROVED,
      EventStatus.PLANNING,
      EventStatus.AWAITING_ARRANGEMENTS,
      EventStatus.AWAITING_SAFETY_CHECK,
      EventStatus.SAFETY_REJECTED,
      EventStatus.CONFIRMED,
    ])('allows cancelling a %s event that has not started', (status) => {
      expect(
        evaluateCancellation({ status, proposedStart: future }, now),
      ).toEqual({ canCancel: true, reason: null });
    });

    it.each([
      EventStatus.DRAFT,
      EventStatus.COMPLETED,
      EventStatus.CANCELLED,
      EventStatus.REJECTED,
    ])('has no cancel option for a %s event', (status) => {
      const check = evaluateCancellation(
        { status, proposedStart: future },
        now,
      );

      expect(check.canCancel).toBe(false);
      expect(check.reason).toEqual(expect.any(String));
      expect(CANCELLABLE_STATUSES).not.toContain(status);
    });

    it('covers every status exactly once, cancellable or not', () => {
      const cancellable = Object.values(EventStatus).filter((status) =>
        evaluateCancellation({ status, proposedStart: future }, now).canCancel,
      );

      expect(cancellable).toEqual([...CANCELLABLE_STATUSES]);
    });

    it('refuses once the event has started, including at the exact start', () => {
      for (const proposedStart of [now, new Date('2030-05-31T09:00:00Z')]) {
        const check = evaluateCancellation(
          { status: EventStatus.CONFIRMED, proposedStart },
          now,
        );

        expect(check.canCancel).toBe(false);
        expect(check.reason).toMatch(/already started/);
      }
    });

    it('allows a moment before the start', () => {
      expect(
        evaluateCancellation(
          { status: EventStatus.CONFIRMED, proposedStart: new Date(now.getTime() + 1) },
          now,
        ).canCancel,
      ).toBe(true);
    });

    it('allows an event with no start date, which cannot have started', () => {
      expect(
        evaluateCancellation(
          { status: EventStatus.SUBMITTED, proposedStart: null },
          now,
        ).canCancel,
      ).toBe(true);
    });
  });

  describe('AC-7: a cancelled event is closed to edits, change requests and registrations', () => {
    it('cannot be edited by the Organiser', () => {
      expect(EDITABLE_STATUSES).not.toContain(EventStatus.CANCELLED);
    });

    it('cannot be edited by the Coordinator during planning', () => {
      expect(PLANNING_STATUSES).not.toContain(EventStatus.CANCELLED);
    });

    it('cannot receive change requests', () => {
      expect(isChangeable(EventStatus.CANCELLED)).toBe(false);
    });

    it('cannot accept new registrations', () => {
      const options = evaluateRegistration(
        {
          status: EventStatus.CANCELLED,
          registrationEnabled: true,
          proposedStart: future,
          registrationOpensAt: null,
          registrationClosesAt: null,
          withdrawalCutoffAt: null,
          expectedAttendance: 100,
        },
        0,
        now,
      );

      expect(options.canRegister).toBe(false);
      expect(options.block).toBe('NOT_OPEN_TO_REGISTRATION');
    });
  });
});
