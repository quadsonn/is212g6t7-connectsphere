-- tc-s2-21-setup.sql: two venues differing in one accessibility feature.
--
-- Pre-condition for TC-S2-21 (Story 18 AC-3). Load AFTER base-users.sql.
-- Every venue is published, managed by u-venue-staff, located on "Campus".
--
--   Both         STEP_FREE_ACCESS, HEARING_LOOP
--   StepOnly     STEP_FREE_ACCESS

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "status", "createdAt", "updatedAt") VALUES
  ('v-s2-both', 'Both', 'Campus', 100, 'u-venue-staff', ARRAY[]::"Facility"[], ARRAY['STEP_FREE_ACCESS', 'HEARING_LOOP']::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('v-s2-step-only', 'StepOnly', 'Campus', 100, 'u-venue-staff', ARRAY[]::"Facility"[], ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
