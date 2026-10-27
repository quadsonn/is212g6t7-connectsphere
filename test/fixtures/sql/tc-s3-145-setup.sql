-- tc-s3-145-setup.sql: a third venue, for a second replacement attempt.
--
-- Pre-condition for TC-S3-145 (Story 52). Load AFTER tc-s3-141-setup.sql.
-- Times are UTC; the affected booking is 1 Oct 2030 09:00-12:00.
--
--   VEN-075 westHall (Vince, USR-013)

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "supportedLayouts", "status", "createdAt", "updatedAt") VALUES
  ('VEN-075', 'westHall', 'westHall building', 200, 'USR-013', ARRAY[]::"Facility"[], ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], ARRAY['THEATRE']::"RoomLayout"[], 'PUBLISHED'::"VenueStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
