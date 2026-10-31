-- tc-s3-170-setup.sql: an event in planning, assigned to Marcus.
--
-- Pre-condition for the reassignment tests (TC-S3-170 to 176). Load AFTER
-- tc-s3-159-setup.sql.
--
--   EVT-296 "Freshman Orientation 2030" PLANNING, Coordinator Marcus

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "submittedAt", "createdAt", "updatedAt") VALUES
  ('EVT-296', 'USR-028', 'USR-030', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 99, 'PLANNING'::"EventStatus", '2030-01-01 00:00:00', '2026-09-02 09:00:00', '2026-09-02 09:00:00');
