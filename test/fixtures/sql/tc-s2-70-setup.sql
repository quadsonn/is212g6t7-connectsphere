-- tc-s2-70-setup.sql: events assigned to USR-004 that are NOT in planning.
--
-- Pre-condition for TC-S2-70 (Story 24 AC-1) and TC-S2-92 (Story 27): planning
-- edits and requirements are refused until planning starts. Load AFTER base-users.sql.
--
--   EVT-128  UNDER_REVIEW  "Still under review"
--   EVT-056      APPROVED      "Approved, not yet planning"

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-128', 'USR-006', 'USR-004', 'Still under review', 'Welcome new students', 'Full-day programme', 'Student engagement',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, 'Two projectors', 'UNDER_REVIEW'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-056', 'USR-006', 'USR-004', 'Approved, not yet planning', 'Welcome new students', 'Full-day programme', 'Student engagement',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, 'Two projectors', 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
