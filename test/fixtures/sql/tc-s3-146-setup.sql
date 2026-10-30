-- tc-s3-146-setup.sql: an event in planning, and three venues with two managers.
--
-- Pre-condition for every test in test/bookings-multi-venue.e2e-spec.ts
-- (Story 53, TC-S3-146 to 151). Load AFTER base-users.sql and tc-s1-96-setup.sql
-- (Vince, USR-013).
--
--   VEN-076 mainHall (Vera, USR-010); VEN-077 breakoutA and VEN-078 breakoutB (Vince): Campus, 300
--   EVT-274 "Summit" PLANNING, USR-006 / USR-004, 1 Oct 2030 09:00-17:00 UTC, 200,
--           theatre, step-free, "PA system"

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "status", "createdAt", "updatedAt") VALUES
  ('VEN-076', 'mainHall',  'Campus', 300, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-077', 'breakoutA', 'Campus', 300, 'USR-013', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-078', 'breakoutB', 'Campus', 300, 'USR-013', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "preferredLayout", "accessibilityRequirements", "equipmentNeeds",
  "status", "createdAt", "updatedAt") VALUES
  ('EVT-274', 'USR-006', 'USR-004', 'Summit', 'p', 'd', 'c', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 200,
     'THEATRE'::"RoomLayout", ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'PA system', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
