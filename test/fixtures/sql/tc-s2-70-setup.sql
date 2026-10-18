-- tc-s2-70-setup.sql: events assigned to u-coordinator-a that are NOT in planning.
--
-- Pre-condition for TC-S2-70 (Story 24 AC-1): planning edits are refused
-- until planning starts. Load AFTER base-users.sql.
--
--   e-s2-under-review  UNDER_REVIEW  "Still under review"
--   e-s2-approved      APPROVED      "Approved, not yet planning"

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-under-review', 'u-organiser', 'u-coordinator-a', 'Still under review', 'Welcome new students', 'Full-day programme', 'Student engagement',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, 'Two projectors', 'UNDER_REVIEW'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-approved', 'u-organiser', 'u-coordinator-a', 'Approved, not yet planning', 'Welcome new students', 'Full-day programme', 'Student engagement',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, 'Two projectors', 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
