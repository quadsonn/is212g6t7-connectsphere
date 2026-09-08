-- US-13: venue drafts, ownership, and the shared layout vocabulary.
--
-- Hand-written for the supportedLayouts change: Prisma would drop and recreate
-- the column, discarding existing values. The USING clause converts the free
-- text written before US-06 into RoomLayout, dropping anything unrecognised
-- rather than failing the migration.

-- AC-2: a draft may be incomplete.
ALTER TABLE "Venue" ALTER COLUMN "name" DROP NOT NULL;
ALTER TABLE "Venue" ALTER COLUMN "location" DROP NOT NULL;
ALTER TABLE "Venue" ALTER COLUMN "capacity" DROP NOT NULL;

-- AC-4: the owning Venue Staff member.
ALTER TABLE "Venue" ADD COLUMN "managedById" TEXT;
ALTER TABLE "Venue"
  ADD CONSTRAINT "Venue_managedById_fkey"
  FOREIGN KEY ("managedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Venue_managedById_idx" ON "Venue"("managedById");

-- Shared layout vocabulary (US-06). 'Theatre' -> THEATRE, and so on.
--
-- Done as add-populate-swap rather than ALTER ... USING: Postgres forbids a
-- subquery in a USING transform, and unnesting an array column requires one.
ALTER TABLE "Venue"
  ADD COLUMN "supportedLayouts_new" "RoomLayout"[] NOT NULL
  DEFAULT ARRAY[]::"RoomLayout"[];

UPDATE "Venue" SET "supportedLayouts_new" = ARRAY(
  SELECT upper(replace(trim(layout), ' ', '_'))::"RoomLayout"
  FROM unnest("supportedLayouts") AS layout
  WHERE upper(replace(trim(layout), ' ', '_'))
    IN ('THEATRE', 'CLASSROOM', 'BANQUET', 'BOARDROOM')
);

ALTER TABLE "Venue" DROP COLUMN "supportedLayouts";
ALTER TABLE "Venue"
  RENAME COLUMN "supportedLayouts_new" TO "supportedLayouts";

-- Mirrors the EventRequest completeness rule (US-04): a venue may omit the
-- required fields only while it is a DRAFT. The service enforces the same at
-- publish; this is the backstop for anything that bypasses it.
ALTER TABLE "Venue"
  ADD CONSTRAINT "Venue_complete_unless_draft" CHECK (
    "status" = 'DRAFT'
    OR (
      "name" IS NOT NULL
      AND "location" IS NOT NULL
      AND "capacity" IS NOT NULL
    )
  );
