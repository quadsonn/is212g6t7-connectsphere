# ADR 0012 — Audit trail for approval/rejection reasoning

- Status: Proposed
- Date: 2026-11-01
- Story: #7/#8/#9 Coordinator review, #22 Booking decisions, #25 Change history, #37 Change-request
  review, #57 Safety check

> **⚠ Partial contradiction with the issue as stated** ("no audit trail"): several decision types
> already keep an append-only record of who decided, when and why. The gap is narrower; see below.

## Context: current state

| Decision | Recorded where | Who / when / why | History kept? |
|---|---|---|---|
| Venue booking approve/reject/reverse (#22) | `BookingDecision` row per decision | yes / yes / reason required on reject and reverse | ✅ append-only |
| Safety check (#57) | `SafetyReview` row per review | yes / yes / reason required unless approved (CHECK) | ✅ append-only |
| Change request (#37) | `EventChangeRequest.decidedById/At/decisionReason` | yes / yes / required on reject (CHECK) | ✅ one decision per request |
| Clarification Q&A (#9, #58) | `ClarificationMessage` thread | yes / yes / body | ✅ append-only |
| Event field edits (#25) | `EventChange` (`changes` JSON) | yes / yes / — | ✅ fields only, not status |
| **Event review: approve / reject / return (#7, #8)** | `EventRequest.decisionReason`, `clarificationRequest` | **no / no** / latest only | ❌ |
| **Event status transitions** | `EventRequest.status` only | **no** (except `arrangementsConfirmedById`) | ❌ |

The gap:

- `EventsService.reject()` writes `decisionReason`. `returnForAmendment()` writes
  `clarificationRequest` and **clears** `decisionReason`. `approve()` clears **both**.
- A rejected request can go back to `DRAFT` (`REJECTED → DRAFT`) and be resubmitted. The earlier
  rejection reason is then overwritten or lost.
- `setStatus()` does not log the transition or who made it. The only trail is any notification
  that was sent.

## Options (not decided)

1. **`EventDecision` table**, like `BookingDecision`: one row per review decision (actor, outcome,
   reason, time). Keep the columns as the "latest" for display.
2. **Generic `EventStatusChange` log** written by `setStatus()` (from, to, actor, reason, time).
   This covers every transition in one place, since `setStatus()` is already the only writer.
3. **Fold into `EventChange`** by recording status in the existing `changes` JSON.
4. **Status quo**, accepting that notifications are the only history of review decisions.

## Consequences

To be filled in when an option is chosen. Options 1–3 need a migration and a backfill decision for
existing events. TODO(team).

## Related

- `prisma/schema.prisma` (`EventRequest.decisionReason`, `BookingDecision`, `SafetyReview`,
  `EventChangeRequest`, `EventChange`, `ClarificationMessage`)
- `src/events/events.service.ts` (`approve`, `reject`, `returnForAmendment`, `decide`, `setStatus`)
- `prisma/migrations/20260908035247_us05_decision_reason_and_clarification`,
  `20261003100000_us23_booking_decisions`, `20261006090000_us38_change_request_decisions`
