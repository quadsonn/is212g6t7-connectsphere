-- tc-s2-22-setup.sql: two venues differing in one facility.
--
-- Pre-condition for TC-S2-22 (Story 18 AC-4). Load AFTER base-users.sql.
-- Every venue is published, managed by USR-010, located on "Campus".
--
--   Full         PROJECTOR, WIFI, STAGE
--   NoWifi       PROJECTOR, STAGE

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "status", "createdAt", "updatedAt") VALUES
  ('VEN-018', 'Full', 'Campus', 100, 'USR-010', ARRAY['PROJECTOR', 'WIFI', 'STAGE']::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-023', 'NoWifi', 'Campus', 100, 'USR-010', ARRAY['PROJECTOR', 'STAGE']::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
