-- tc-s1-01-setup.sql: one SUBMITTED event request, ready for review.
--
-- Pre-condition for TC-S1-01 (and the other US-07/08/09 test cases that need a
-- single request under review). Load AFTER base-users.sql.
--
--   EVT-146  SUBMITTED, raised by USR-006, assigned to USR-004

INSERT INTO "EventRequest" (
  "id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt"
) VALUES (
  'EVT-146', 'USR-006', 'USR-004',
  'Freshman Orientation 2030', 'Welcome new students',
  'Full-day programme with talks and booths', 'Student engagement',
  '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320,
  'SUBMITTED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'
);
