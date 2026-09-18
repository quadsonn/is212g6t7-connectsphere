-- US-04: making the request fields nullable (previous migration) let partial
-- drafts be stored, but it also removed the database's guarantee that a
-- non-draft request is complete. This restores it.
--
-- A row may omit these fields only while it is a DRAFT. Any other status
-- requires the full set. The service enforces the same rule at the
-- DRAFT -> SUBMITTED transition; this is the backstop for anything that
-- bypasses it (a migration, a manual fix, a future code path).
--
-- Prisma's schema language cannot express table-level CHECK constraints, so
-- this migration is hand-written and the constraint is invisible to
-- schema.prisma. Keep them in step by hand.
ALTER TABLE "EventRequest"
  ADD CONSTRAINT "EventRequest_complete_unless_draft" CHECK (
    "status" = 'DRAFT'
    OR (
      "name" IS NOT NULL
      AND "purpose" IS NOT NULL
      AND "description" IS NOT NULL
      AND "category" IS NOT NULL
      AND "proposedStart" IS NOT NULL
      AND "proposedEnd" IS NOT NULL
      AND "expectedAttendance" IS NOT NULL
    )
  );
