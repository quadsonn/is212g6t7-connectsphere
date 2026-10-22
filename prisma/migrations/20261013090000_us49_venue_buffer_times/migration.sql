-- US-49 — per-venue setup and turnaround time (Week 7 Customer Change #1).
--
-- Supersedes the note in 20261005140014_us24_no_overlapping_approved_bookings
-- that buffer time is "intentionally NOT modelled": the customer reintroduced
-- it. This migration adds the fields only; applying them to availability,
-- conflict checks and the EXCLUDE constraint is US-50.
--
-- Additive: NOT NULL DEFAULT 0 fills every existing venue with 0, which is
-- exactly how they behaved before (no buffer). No existing value is converted
-- or discarded.

ALTER TABLE "Venue"
  ADD COLUMN "setupMinutes"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "turnaroundMinutes" INTEGER NOT NULL DEFAULT 0;

-- Prisma cannot express CHECK constraints. The DTO enforces the same range;
-- this is the backstop for writes that bypass it.
ALTER TABLE "Venue"
  ADD CONSTRAINT "Venue_setupMinutes_range" CHECK ("setupMinutes" BETWEEN 0 AND 480),
  ADD CONSTRAINT "Venue_turnaroundMinutes_range" CHECK ("turnaroundMinutes" BETWEEN 0 AND 480);
