# ADR 0007 — Overlap rules enforced at the database level with hand-written SQL

- Status: Accepted
- Date: 2026-10-05 (US-24 constraint); extended 2026-10-17 (US-54)
- Story: #23 Overlap detection (US-24 in code), #54 Holds, #31 Reserve equipment (US-32 in code),
  #50 Buffers

> **⚠ Contradiction with the brief.** Only **venue bookings** have a DB-level overlap constraint.
> - **Equipment reservations have none.** The rule is quantity-based (the sum of overlapping
>   approved reservations must stay within `totalQuantity`), which an EXCLUDE constraint cannot
>   express. The service enforces it under a row lock (`SELECT … FOR UPDATE` on `Equipment`).
>   The schema says so: "the index helps the query, the service enforces the rule".
> - **#50 buffers are app-only.** `conflictsFor()` pads bookings with setup/turnaround time, but
>   the constraint still compares raw `tsrange("start","end")`. ADR 0001 said #50 must update both
>   together; that did not happen.
> - **Venue blocks** (`VenueBlock`, #16) are in another table and are not covered by the constraint.

## Context

Prisma's schema language cannot express EXCLUDE constraints. The service already serialises work
per venue, but the migration wants a backstop "for anything that writes VenueBooking without going
through that path (scripts, manual SQL, future code)" (US-24 migration).

## Decision

- **Venue bookings:** the hand-written migration adds `btree_gist` and an
  `EXCLUDE USING gist ("venueId" WITH =, tsrange("start","end") WITH &&)`:
  - first `WHERE status = 'APPROVED'` (`VenueBooking_no_overlapping_approved`);
  - from #54, `WHERE status IN ('APPROVED','HELD')` (`VenueBooking_no_overlapping_committed`);
  - plus `CHECK (status <> 'HELD' OR holdExpiresAt IS NOT NULL)`.
- `tsrange` not `tstzrange`: the columns are `TIMESTAMP` without a time zone, and the cast would not
  be IMMUTABLE. Its half-open `[)` bounds match `booking-overlap.ts`.
- Each migration starts with a `DO $$` preflight. If existing rows break the rule it stops with a
  list and changes nothing. Each has an e2e migration test.
- A violation (SQLSTATE `23P01`) is mapped to the same 409 as an app-level conflict.
- App layer: `lockVenue` (`pg_advisory_xact_lock`) for venues, and `FOR UPDATE` on the item plus
  `FOR SHARE` on the event for equipment.

## Consequences

- ➕ Two committed venue bookings can never overlap, even when the service is bypassed.
- ➖ Equipment over-commitment, buffer clashes and block clashes are prevented only when writes go
  through the services.
- ➖ Expired-but-unreleased `HELD` rows still count for the constraint, so writes must release
  them first (ADR 0001).
- ➖ Any change to the range must be made in two places, the constraint and `conflictsFor()`.
  TODO(team): decide whether to bring #50 buffers into the constraint.

## Related

- [ADR 0001](0001-held-hard-blocks-at-db-level.md), [ADR 0003](0003-pending-bookings-soft-warning.md)
- `prisma/migrations/20261005140014_us24_no_overlapping_approved_bookings`,
  `20261017090100_us54_exclude_approved_and_held`, `20261013090000_us49_venue_buffer_times`
- `src/bookings/venue-lock.ts`, `src/bookings/bookings.service.ts` (`conflictsFor`),
  `src/equipment/equipment-reservations.service.ts` (`lockEquipment`, `lockEvent`)
- Tests: `test/booking-overlap-migration.e2e-spec.ts`, `test/us54-hold-constraint-migration.e2e-spec.ts`,
  `test/bookings-conflicts.e2e-spec.ts`
