-- tc-s2-18-setup.sql: two published venues and one draft that matches every filter.
--
-- Pre-condition for TC-S2-18 (Story 18 baseline). Load AFTER base-users.sql.
-- Every venue is published, managed by u-venue-staff, located on "Campus".
--
--   v-s2-alpha   "Alpha"         capacity 500, STAGE
--   v-s2-bravo   "Bravo"         capacity 100
--   v-s2-draft   "Draft"         DRAFT, capacity 500, STAGE (must never be returned)

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "status", "createdAt", "updatedAt") VALUES
  ('v-s2-alpha', 'Alpha', 'Campus', 500, 'u-venue-staff', ARRAY['STAGE']::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('v-s2-bravo', 'Bravo', 'Campus', 100, 'u-venue-staff', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('v-s2-draft', 'Draft', 'Campus', 500, 'u-venue-staff', ARRAY['STAGE']::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'DRAFT'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
