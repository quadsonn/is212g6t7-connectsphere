# ADR 0009 — Status enums have grown beyond the original spec

- Status: Proposed
- Date: 2026-11-01
- Story: #5, #8, #9, #11, #42, #43, #54, #57 (each added a status)

## Context

CLAUDE.md §5 specified 9 `EventStatus` values, 3 `BookingStatus` values and 2
`RegistrationStatus` values. The schema now has:

| Enum | Spec | Now | Added |
|---|---|---|---|
| `EventStatus` | 9 | 14 | `RETURNED` (#8), `AWAITING_CLARIFICATION` (#9), `AWAITING_ARRANGEMENTS` (#11), `AWAITING_SAFETY_CHECK`, `SAFETY_REJECTED` (Change #6) |
| `BookingStatus` | 3 | 5 | `HELD` (#54), `RELEASED` (#54/#43/#44/#52) |
| `ReservationStatus` | — | 4 | `RELEASED` (#32) |
| `RegistrationStatus` | 2 | 2 | — |

Issues the code already notes:

- `RETURNED` and `AWAITING_CLARIFICATION` both mean "waiting on the Organiser". The schema marks
  this AMBIGUOUS: "the customer should confirm they really want both".
- `AWAITING_ARRANGEMENTS` has no transition into it. "Nothing moves an event to
  AWAITING_ARRANGEMENTS yet", so `PLANNING` jumps straight to `AWAITING_SAFETY_CHECK`.
- The #5 schema comment says clarification is "a signal carried alongside status rather than a
  status". #9 later made it a status, and both mechanisms still exist (`clarificationRequest`
  column and the status).
- Postgres can add enum values but cannot drop them (`ALTER TYPE … DROP VALUE` does not exist).
  Removing one means rebuilding the type in a migration.

What keeps this manageable: `ALLOWED_TRANSITIONS` in `event-status.machine.ts` must cover every
`EventStatus`, so TypeScript flags a missing row. `events-status-audit.spec.ts` fails if any code
other than `setStatus()` writes the status column.

## Options (not decided)

1. **Keep and document.** Accept the current set, add a state diagram, and get customer
   confirmation for each AMBIGUOUS status.
2. **Prune.** Drop or merge statuses with no real use (`AWAITING_ARRANGEMENTS`; possibly merge
   `RETURNED`/`AWAITING_CLARIFICATION`), using a type-rebuild migration that follows the CLAUDE.md
   §9 data-preservation rule.
3. **Split status from sub-state.** Keep a small lifecycle enum and move "waiting on X" into
   separate fields or flags, as #5 first did for clarification.
4. **Freeze.** No new statuses without an ADR. New needs go into flags by default.

## Consequences

To be filled in when an option is chosen. TODO(team).

## Related

- `prisma/schema.prisma` (`EventStatus`, `BookingStatus`, `ReservationStatus`)
- `src/events/event-status.machine.ts`, `src/events/events-status-audit.spec.ts`,
  `src/bookings/booking-status.machine.ts`
- [ADR 0004](0004-awaiting-safety-check-status.md)
