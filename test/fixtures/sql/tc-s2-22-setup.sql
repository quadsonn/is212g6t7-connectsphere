-- tc-s2-22-setup.sql: two venues differing in one facility.
--
-- Pre-condition for TC-S2-22 (Story 18 AC-4). Load AFTER base-users.sql.
-- Every venue is published, managed by u-venue-staff, located on "Campus".
--
--   Full         PROJECTOR, WIFI, STAGE
--   NoWifi       PROJECTOR, STAGE

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "status", "createdAt", "updatedAt") VALUES
  ('v-s2-full', 'Full', 'Campus', 100, 'u-venue-staff', ARRAY['PROJECTOR', 'WIFI', 'STAGE']::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('v-s2-no-wifi', 'NoWifi', 'Campus', 100, 'u-venue-staff', ARRAY['PROJECTOR', 'STAGE']::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
