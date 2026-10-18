-- tc-s2-83-setup.sql: an event in PLANNING, assigned to u-coordinator-a, ready
-- to be handed to another Coordinator.
--
-- Pre-condition for TC-S2-83 (Story 26 AC-1), and the base for TC-S2-84 to
-- TC-S2-88. Load AFTER base-users.sql (which has two Coordinators:
-- u-coordinator-a "Cody Coordinator" and u-coordinator-b "Casey Coordinator").
--
--   e-s2-reassign  PLANNING "Freshman Orientation 2030", u-organiser / u-coordinator-a

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "registrationEnabled", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-reassign', 'u-organiser', 'u-coordinator-a', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme', 'Student engagement',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, NULL, false, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
