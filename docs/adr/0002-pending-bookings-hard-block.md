# ADR 0002 — Pending (REQUESTED) venue bookings hard-block like approved ones

- Status: Superseded by ADR 0003
- Date: TODO(team): confirm when this was decided
- Story: #20 Submit a venue booking request, #23 Overlap detection

> **⚠ Contradiction with the code.** No code, migration, test or commit on any branch shows a
> `REQUESTED` booking ever blocking another request. The first implementation of booking requests
> (commit `920e19e`, 2026-10-05) already returned an overlap with a pending request as a warning
> (`OVERLAPS_PENDING_REQUEST`), and the first DB constraint (US-24 migration, 2026-10-05) covered
> `APPROVED` only. If this decision existed, it was made in planning before any code was written.
> TODO(team): confirm it existed and where it was recorded (sprint planning notes, board), or delete
> this ADR.

## Context

TODO(team): confirm reasoning. The code does not show why pending requests were ever meant to block.

## Decision

As described by the team: an overlapping `REQUESTED` booking was to be treated the same as an
`APPROVED` one, so a second request for an occupied slot would be refused.

## Consequences

TODO(team): confirm. Replaced by ADR 0003 before (or as) it was implemented, so it left no trace in
the schema or the services.

## Related

- Superseded by: [ADR 0003](0003-pending-bookings-soft-warning.md)
- Commit `920e19e` (first booking-request code, already soft); commit `b3d2173` (US-24 overlap detection)
- `prisma/migrations/20261005140014_us24_no_overlapping_approved_bookings/migration.sql`
