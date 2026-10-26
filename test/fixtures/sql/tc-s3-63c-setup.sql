-- tc-s3-63c-setup.sql: a second good alternative.
--
-- Pre-condition for TC-S3-63 (Story 41 AC-1, two venues attached) and TC-S3-69
-- (AC-7, history). Load AFTER tc-s3-63-setup.sql.
--
--   VEN-043   westHall, capacity 150, step-free, managed by USR-010

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "supportedLayouts", "turnaroundMinutes", "status", "createdAt", "updatedAt") VALUES
  ('VEN-043', 'westHall', 'westHall building', 150, 'USR-010', ARRAY[]::"Facility"[], ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], ARRAY[]::"RoomLayout"[], 0, 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
