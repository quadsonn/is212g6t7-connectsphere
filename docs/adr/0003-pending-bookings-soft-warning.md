# ADR 0003 — Pending (REQUESTED) venue bookings give a soft overlap warning, not a hard block

- Status: Accepted
- Date: 2026-10-05 (first implemented in commit `920e19e`; restated in ADR 0001 on 2026-10-17)
- Story: #20 Submit a venue booking request, #23 Overlap detection (code labels these US-21 and
  US-24; see note under Related)

## Context

Several Coordinators can ask for the same venue at the same time. Someone has to decide between
them. The code's own reasons:

- Booking-request AC-5 (`bookings.service.ts`, commit `920e19e`): "an overlap with another pending
  request is allowed but reported as a warning".
- ADR 0001: "several Coordinators may ask for the same slot, and Venue Staff choose".
- US-54 migration comment: "pending requests may overlap (a team decision, US-24 AC-3), they only warn".

TODO(team): confirm the reason for reversing ADR 0002, if it was more than the AC wording.

## Decision

- **Request time:** an overlap with an `APPROVED` booking, a live `HELD` booking, a venue block
  or (from #50) a buffer window returns 409. An overlap with a `REQUESTED` booking is allowed.
  The new booking is created and the response carries an `OVERLAPS_PENDING_REQUEST` warning.
- **Review time:** `classifyConflicts()` sorts overlaps into hard (`APPROVED`, live `HELD`) and
  soft (`REQUESTED`). Venue Staff see both in the conflict report. Approval re-checks under
  `lockVenue` (a per-venue `pg_advisory_xact_lock`).
- **Database:** `REQUESTED` is deliberately left out of the EXCLUDE constraint (ADR 0007).
- **Search and availability (#18):** a venue with only pending requests still shows as available.
  Only confirmed bookings count (`confirmedOverlapping`, later `liveBookingsWhere`).

## Consequences

- ➕ Coordinators are not locked out by a request that may be rejected. Venue Staff choose between
  competing requests.
- ➕ No pending request can take a slot. Only approval does, and the DB enforces it.
- ➖ Venue Staff have to resolve the competing requests. Once one is approved, the others now
  overlap an approved booking and will be refused if anyone tries to approve them.
- ➖ The calendar and search can say "available" for a slot that is already contested.

## Related

- Supersedes: [ADR 0002](0002-pending-bookings-hard-block.md). See also [ADR 0001](0001-held-hard-blocks-at-db-level.md)
- `src/bookings/booking.types.ts` (`classifyConflicts`, soft/hard), `src/bookings/booking-overlap.ts`,
  `src/bookings/bookings.service.ts` (`conflictsFor`), `src/bookings/venue-lock.ts`
- Tests: `src/bookings/booking-conflicts.spec.ts`, `test/bookings-conflicts.e2e-spec.ts`,
  `src/bookings/bookings-request.service.spec.ts`
- Story numbering: `docs/BACKLOG.md` has overlap detection as #23, but code, migrations and tests
  call it US-24. The booking request is #20 there and US-21 in code.
