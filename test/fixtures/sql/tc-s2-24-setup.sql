-- tc-s2-24-setup.sql: venues for the name lookup, one of them a draft.
--
-- Pre-condition for TC-S2-24 (Story 18 AC-5). Load AFTER base-users.sql.
-- Every venue is published, managed by u-venue-staff, located on "Campus".
--
--   Sandbox Auditorium  capacity 400
--   Seminar Room        capacity 40
--   Draft Auditorium    DRAFT (must never be returned)

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "status", "createdAt", "updatedAt") VALUES
  ('v-s2-sandbox', 'Sandbox Auditorium', 'Campus', 400, 'u-venue-staff', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('v-s2-seminar', 'Seminar Room', 'Campus', 40, 'u-venue-staff', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('v-s2-draft-auditorium', 'Draft Auditorium', 'Campus', 100, 'u-venue-staff', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'DRAFT'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
