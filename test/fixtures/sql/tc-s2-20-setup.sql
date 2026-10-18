-- tc-s2-20-setup.sql: two venues either side of a minimum-capacity boundary.
--
-- Pre-condition for TC-S2-20 (Story 18 AC-2). Load AFTER base-users.sql.
-- Every venue is published, managed by u-venue-staff, located on "Campus".
--
--   Hundred      capacity 100
--   NinetyNine   capacity 99

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "status", "createdAt", "updatedAt") VALUES
  ('v-s2-hundred', 'Hundred', 'Campus', 100, 'u-venue-staff', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('v-s2-ninety-nine', 'NinetyNine', 'Campus', 99, 'u-venue-staff', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
