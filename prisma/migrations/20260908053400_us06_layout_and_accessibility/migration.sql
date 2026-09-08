-- US-06: preferred room layout and accessibility requirements.
--
-- Hand-written because Prisma would drop and recreate "preferredLayout",
-- discarding existing values. The USING clause converts the free text written
-- before this story into the new enum instead; anything unrecognised becomes
-- NULL, which is valid — layout is a preference, not a required field.

CREATE TYPE "RoomLayout" AS ENUM ('THEATRE', 'CLASSROOM', 'BANQUET', 'BOARDROOM');

CREATE TYPE "AccessibilityFeature" AS ENUM (
  'STEP_FREE_ACCESS',
  'HEARING_LOOP',
  'ACCESSIBLE_RESTROOMS'
);

ALTER TABLE "EventRequest"
  ALTER COLUMN "preferredLayout" TYPE "RoomLayout"
  USING (
    CASE upper(trim("preferredLayout"))
      WHEN 'THEATRE'   THEN 'THEATRE'::"RoomLayout"
      WHEN 'CLASSROOM' THEN 'CLASSROOM'::"RoomLayout"
      WHEN 'BANQUET'   THEN 'BANQUET'::"RoomLayout"
      WHEN 'BOARDROOM' THEN 'BOARDROOM'::"RoomLayout"
      ELSE NULL::"RoomLayout"
    END
  );

-- Renamed, not replaced: the existing free text is the qualification the new
-- structured requirements sit alongside.
ALTER TABLE "EventRequest"
  RENAME COLUMN "accessibilityNeeds" TO "accessibilityNotes";

ALTER TABLE "EventRequest"
  ADD COLUMN "accessibilityRequirements" "AccessibilityFeature"[]
  NOT NULL DEFAULT ARRAY[]::"AccessibilityFeature"[];
