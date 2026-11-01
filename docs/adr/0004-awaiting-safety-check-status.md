# ADR 0004 — AWAITING_SAFETY_CHECK between Coordinator "Confirm Event" and the Safety Officer check

- Status: Accepted
- Date: 2026-10-13 (status added by the safety-check migration); 2026-10-15 (US-42 confirm flow)
- Story: #42 Confirm an event once arrangements are ready, #57 Operational Safety Check,
  Week 7 Requirement Change #6

## Context

Requirement Change #6 introduced a Safety Officer. In the code's words, "no event is confirmed
without an approved safety check" (`event-status.machine.ts`). Before this, US-11 let
`PLANNING → CONFIRMED` happen directly. The event needed a resting state after the Coordinator says
the arrangements are ready and before the Safety Officer decides.

Equipment requirements come in two kinds. Lines linked to a catalogue item can be checked
automatically against approved reservations. A free-text line "names nothing to reserve"
(`EquipmentRequirement` schema comment), so the system has nothing to check it against.

TODO(team): confirm why this is a separate status rather than a flag on PLANNING.

## Decision

- `EventStatus` gains `AWAITING_SAFETY_CHECK`, placed before `CONFIRMED`, and `SAFETY_REJECTED`.
- **Way in:** only `EventConfirmationService.confirm()`, called by the assigned Coordinator, moves
  `PLANNING` or `AWAITING_ARRANGEMENTS` to this status. It requires
  `evaluateConfirmationReadiness()` to pass:
  - at least one live booking, and every live booking `APPROVED` and not flagged for review;
  - every catalogue-linked requirement covered by `APPROVED` reservations;
  - every free-text requirement ticked by the Coordinator (`manuallyConfirmedAt`/`ById`).
  The confirmation records `arrangementsConfirmedAt/ById` and `safetyQueuedAt`.
  `SafetyService.resubmit` is the only other way in, after feedback.
- **Way out:** the Safety Officer's outcome decides the next status: APPROVED → `CONFIRMED`,
  CHANGES_REQUESTED → `PLANNING`, REJECTED → `SAFETY_REJECTED`. If the arrangements stop being
  ready, `SafetyReadinessService` moves the event back to `PLANNING` on its own.
- **Second lock:** `EventsService.setStatus()` refuses `CONFIRMED` unless the latest `SafetyReview`
  is an approval.

## Consequences

- ➕ There are two ways to stop an unchecked event being confirmed: the transition table and
  `assertSafetyApproved`. The Coordinator's checklist, the Safety queue and the approval all use
  the same readiness rule.
- ➕ The record shows who confirmed and when, both for the event and for each free-text line.
- ➖ The tick on a free-text line records who and when, not what was checked. Free text is never
  verified by the system.
- ➖ `PLANNING → AWAITING_SAFETY_CHECK` is allowed directly because nothing enters
  `AWAITING_ARRANGEMENTS` yet (ADR 0009).
- ➖ Two branches added the same enum value in parallel. The US-42 migration uses
  `ADD VALUE IF NOT EXISTS` so it does not matter which runs first.

## Related

- `prisma/migrations/20261013085112_safety_check`, `20261015090000_us42_confirm_arrangements`,
  `20261013135236_safety_resubmission`
- `src/events/event-status.machine.ts`, `src/events/confirmation-readiness.rules.ts`,
  `src/events/event-confirmation.service.ts`, `src/events/events.service.ts` (`setStatus`),
  `src/safety/safety.service.ts`, `src/safety/safety-readiness.service.ts`
- Tests: `test/events-confirm.e2e-spec.ts`, `test/events-confirm-migration.e2e-spec.ts`,
  `test/safety-check.e2e-spec.ts`, `src/events/confirmation-readiness.rules.spec.ts`,
  `src/events/events-safety-gate.service.spec.ts`, `src/safety/safety-readiness.service.spec.ts`
