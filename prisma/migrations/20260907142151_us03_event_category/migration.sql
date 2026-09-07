-- US-03: EventRequest.category is required at submission.
--
-- Added in two steps so the migration is safe on a non-empty table: existing
-- rows are backfilled with a placeholder, then the default is dropped so every
-- new row must supply a real value (the API requires it in the DTO).
ALTER TABLE "EventRequest" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'Uncategorised';
ALTER TABLE "EventRequest" ALTER COLUMN "category" DROP DEFAULT;
