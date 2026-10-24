-- tc-s2-18-setup.sql: two published venues and one draft that matches every filter.
--
-- Pre-condition for TC-S2-18 (Story 18 baseline). Load AFTER base-users.sql.
-- Every venue is published, managed by USR-010, located on "Campus".
--
--   VEN-011   "Alpha"         capacity 500, STAGE
--   VEN-015   "Bravo"         capacity 100
--   VEN-016   "Draft"         DRAFT, capacity 500, STAGE (must never be returned)

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "status", "createdAt", "updatedAt") VALUES
  ('VEN-011', 'Alpha', 'Campus', 500, 'USR-010', ARRAY['STAGE']::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-015', 'Bravo', 'Campus', 100, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-016', 'Draft', 'Campus', 500, 'USR-010', ARRAY['STAGE']::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'DRAFT'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
