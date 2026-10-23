-- tc-s2-94-setup.sql: three more events in planning, assigned to
-- USR-004, with no equipment notes, requirements or reservations yet.
--
-- Pre-condition for TC-S2-94 (Story 27 AC-3): the test records requirements on
-- two of them, then checks which ones Technical Support see. Load AFTER
-- base-users.sql and tc-s2-68-setup.sql.
--
--   EVT-052     PLANNING "With equipment"
--   EVT-054  PLANNING "Support only"
--   EVT-053       PLANNING "Nothing recorded"

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "registrationEnabled", "status", "createdAt", "updatedAt") VALUES
  ('EVT-052', 'USR-006', 'USR-004', 'With equipment', 'Welcome new students', 'Full-day programme', 'Student engagement',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, NULL, false, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-054', 'USR-006', 'USR-004', 'Support only', 'Welcome new students', 'Full-day programme', 'Student engagement',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, NULL, false, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-053', 'USR-006', 'USR-004', 'Nothing recorded', 'Welcome new students', 'Full-day programme', 'Student engagement',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, NULL, false, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
