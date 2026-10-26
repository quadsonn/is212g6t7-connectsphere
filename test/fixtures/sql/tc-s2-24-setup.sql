-- tc-s2-24-setup.sql: venues for the name lookup, one of them a draft.
--
-- Pre-condition for TC-S2-24 (Story 18 AC-5). Load AFTER base-users.sql.
-- Every venue is published, managed by USR-010, located on "Campus".
--
--   Sandbox Auditorium  capacity 400
--   Seminar Room        capacity 40
--   Draft Auditorium    DRAFT (must never be returned)

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "status", "createdAt", "updatedAt") VALUES
  ('VEN-031', 'Sandbox Auditorium', 'Campus', 400, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-032', 'Seminar Room', 'Campus', 40, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-017', 'Draft Auditorium', 'Campus', 100, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'DRAFT'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
