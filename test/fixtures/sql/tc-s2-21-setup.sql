-- tc-s2-21-setup.sql: two venues differing in one accessibility feature.
--
-- Pre-condition for TC-S2-21 (Story 18 AC-3). Load AFTER base-users.sql.
-- Every venue is published, managed by USR-010, located on "Campus".
--
--   Both         STEP_FREE_ACCESS, HEARING_LOOP
--   StepOnly     STEP_FREE_ACCESS

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "status", "createdAt", "updatedAt") VALUES
  ('VEN-014', 'Both', 'Campus', 100, 'USR-010', ARRAY[]::"Facility"[], ARRAY['STEP_FREE_ACCESS', 'HEARING_LOOP']::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-033', 'StepOnly', 'Campus', 100, 'USR-010', ARRAY[]::"Facility"[], ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
