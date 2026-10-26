-- tc-s2-68-setup.sql: an event in PLANNING, assigned to USR-004, with
-- no venue booking, equipment reservation or recorded change yet.
--
-- Pre-condition for TC-S2-68 (Story 24 AC-1), and the base for every other
-- Story 24 and Story 25 test case, and for Story 27 (TC-S2-89 to TC-S2-96).
-- Load AFTER base-users.sql (and
-- base-venues.sql where the test case says so).
--
--   EVT-105  PLANNING "Freshman Orientation 2030", USR-006 / USR-004,
--                  1 Oct 2030 09:00-17:00 UTC, 320 expected, "Two projectors"

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-105', 'USR-006', 'USR-004', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme', 'Student engagement',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, 'Two projectors', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
