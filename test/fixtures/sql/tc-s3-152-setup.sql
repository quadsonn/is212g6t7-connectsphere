-- tc-s3-152-setup.sql: two venues with different managers, and an event in planning.
--
-- Pre-condition for every test in test/us54-venue-holds.e2e-spec.ts (Story 54,
-- TC-S3-152 to 158). Load AFTER base-users.sql, tc-s1-25-setup.sql (Leah Lead,
-- USR-012) and tc-s1-96-setup.sql (Vince, USR-013).
--
--   VEN-079 Main Hall (Vera, USR-010); VEN-080 East Annex (Vince, USR-013): Level 1, 300
--   EVT-276 "Gala" PLANNING, USR-006 / USR-004, 1 Oct 2030 18:00-22:00 UTC, 120

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "status", "createdAt", "updatedAt") VALUES
  ('VEN-079', 'Main Hall',  'Level 1', 300, 'USR-010', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-080', 'East Annex', 'Level 1', 300, 'USR-013', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-276', 'USR-006', 'USR-004', 'Gala', 'Celebrate', 'An evening', 'Social', '2030-10-01 18:00:00', '2030-10-01 22:00:00', 120, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
