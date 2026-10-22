# ADR 0001 — HELD hard-blocks at DB level; REQUESTED stays a soft warning

- Status: Accepted
- Date: 2026-10-17
- Story: US-54 "Place a Tentative Venue Hold with Expiry" (Week 7 Customer Change #4)

## Context

Venue Staff can now hold a slot for an event until an expiry time (status `HELD`). The customer
asked that a hold, while active, blocks other requests for that slot, that it expires on its own,
and that an expired hold is never treated as a confirmed booking.

Before US-54, overlap was enforced in two layers (US-24):

- **App:** `BookingsService.conflictsFor()` under the per-venue lock (`lockVenue`). An overlapping
  `APPROVED` booking or venue block is a hard conflict (409). An overlapping `REQUESTED` booking is
  only a soft warning — several Coordinators may ask for the same slot, and Venue Staff choose.
- **Database:** `EXCLUDE USING gist ("venueId" WITH =, tsrange("start","end") WITH &&) WHERE status = 'APPROVED'`.

Several teammates run their own backend against one shared database, so anything a background job
does must be safe when it runs in several processes at once.

## Decision

1. **A live hold is a hard conflict, at both layers.** `classifyConflicts()` treats a live `HELD`
   row like `APPROVED`. The EXCLUDE constraint is replaced by `VenueBooking_no_overlapping_committed`,
   the same expression `WHERE status IN ('APPROVED','HELD')`. A `CHECK` makes every `HELD` row carry
   a `holdExpiresAt`.
2. **REQUESTED stays a soft warning.** Unchanged team decision: pending requests may overlap each
   other and holds' neighbours; they never enter the constraint.
3. **Expiry is decided when reading, not by the job.** `isLiveHold(b, now)` is
   `status = HELD AND holdExpiresAt > now`, and `liveBookingsWhere(now)` is the one query filter for
   "this booking occupies its slot". Every conflict, availability, calendar and search query uses it,
   so an expired hold is free the moment it expires, whether or not anything has released it.
4. **Expired rows are cleared before they can collide.** The constraint cannot see the clock, so an
   expired-but-unreleased `HELD` row would still reject an overlapping approval. Every transaction that
   inserts or approves a booking on a venue (request, decision, hold place/convert/extend/release)
   first calls `releaseExpiredHolds(tx, { venueId })` under `lockVenue`.
5. **The expiry job is idempotent.** Every minute, a conditional `UPDATE … WHERE status = 'HELD' AND
   holdExpiresAt <= now RETURNING id` releases due holds, and `UPDATE … SET holdWarningSentAt = now
   WHERE … holdWarningSentAt IS NULL RETURNING id` claims 24-hour warnings. Notifications are sent only
   for returned rows, inside the same transaction. Postgres row locks make a second, concurrent
   instance re-check the `WHERE` and get nothing back, so nobody is notified twice. There is never a
   read-then-write. The in-transaction release (4) uses the same function, so its notices are not lost
   or doubled either.

## Consequences

- An approved booking and a live hold can never overlap, even if code bypasses `BookingsService`.
- Correctness does not depend on the job running: if it stops, holds still expire on read and are
  released by the next write on their venue; only the expiry *notification* waits.
- Expired `HELD` rows may sit in the table for up to a minute (or until the next write on the venue).
  Code that reads bookings must use `liveBookingsWhere()` / `isLiveHold()`, never `status = 'HELD'`
  alone. `APPROVED`-only counts (registration, confirmation) are unaffected: a hold is never `APPROVED`.
- When US-50 pads overlap with venue buffers, it must change the range expression in this constraint
  and in `conflictsFor()` together, keeping the `WHERE`.
- Venue Staff can now list bookable events (name, dates, attendance, coordinator only) for a venue
  they manage, to pick one to hold for — a narrow widening of US-25's "related events only" read.
