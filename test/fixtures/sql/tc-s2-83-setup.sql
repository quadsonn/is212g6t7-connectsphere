-- tc-s2-83-setup.sql: an event in PLANNING, assigned to USR-004, ready
-- to be handed to another Coordinator.
--
-- Pre-condition for TC-S2-83 (Story 26 AC-1), and the base for TC-S2-84 to
-- TC-S2-88. Load AFTER base-users.sql (which has two Coordinators:
-- USR-004 "Cody Coordinator" and USR-005 "Casey Coordinator"). Since Week 7
-- Change 5 the Lead reassigns, so the tests also load tc-s1-25-setup.sql.
--
--   EVT-107  PLANNING "Freshman Orientation 2030", USR-006 / USR-004

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "registrationEnabled", "status", "createdAt", "updatedAt") VALUES
  ('EVT-107', 'USR-006', 'USR-004', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme', 'Student engagement',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, NULL, false, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
