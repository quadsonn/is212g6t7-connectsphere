-- tc-s2-94-setup.sql: three more events in planning, assigned to
-- u-coordinator-a, with no equipment notes, requirements or reservations yet.
--
-- Pre-condition for TC-S2-94 (Story 27 AC-3): the test records requirements on
-- two of them, then checks which ones Technical Support see. Load AFTER
-- base-users.sql and tc-s2-68-setup.sql.
--
--   e-s2-94-equipment     PLANNING "With equipment"
--   e-s2-94-support-only  PLANNING "Support only"
--   e-s2-94-nothing       PLANNING "Nothing recorded"

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "registrationEnabled", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-94-equipment', 'u-organiser', 'u-coordinator-a', 'With equipment', 'Welcome new students', 'Full-day programme', 'Student engagement',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, NULL, false, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-94-support-only', 'u-organiser', 'u-coordinator-a', 'Support only', 'Welcome new students', 'Full-day programme', 'Student engagement',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, NULL, false, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-94-nothing', 'u-organiser', 'u-coordinator-a', 'Nothing recorded', 'Welcome new students', 'Full-day programme', 'Student engagement',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, NULL, false, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
