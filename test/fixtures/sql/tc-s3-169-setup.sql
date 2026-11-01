-- tc-s3-169-setup.sql: one active event each for Marcus and Fatima.
--
-- Pre-condition for TC-S3-169 (filter) and TC-S3-176 (Lead-only; a
-- Coordinator sees their own). Load AFTER tc-s3-159-setup.sql.
--
--   EVT-294 PLANNING, Marcus; EVT-295 PLANNING, Fatima

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "submittedAt", "createdAt", "updatedAt") VALUES
  ('EVT-294', 'USR-028', 'USR-030', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 99, 'PLANNING'::"EventStatus", '2030-01-01 00:00:00', '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-295', 'USR-028', 'USR-031', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 99, 'PLANNING'::"EventStatus", '2030-01-01 00:00:00', '2026-09-02 09:00:00', '2026-09-02 09:00:00');
