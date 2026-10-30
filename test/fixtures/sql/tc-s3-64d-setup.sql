-- tc-s3-64d-setup.sql: no free venue is big enough for the Showcase's 80.
--
-- Pre-condition for the capacity test "nothing is offered when no free venue
-- is big enough" (TC-S3-64). Load AFTER tc-s3-63-setup.sql.
--
--   VEN-042   eastHall cut to capacity 40
--   VEN-056   seminarRoom, capacity 60

UPDATE "Venue" SET "capacity" = 40 WHERE "id" = 'VEN-042';

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "supportedLayouts", "turnaroundMinutes", "status", "createdAt", "updatedAt") VALUES
  ('VEN-056', 'seminarRoom', 'seminarRoom building', 60, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], ARRAY[]::"RoomLayout"[], 0, 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
