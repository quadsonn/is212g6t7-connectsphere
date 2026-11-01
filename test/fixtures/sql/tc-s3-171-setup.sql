-- tc-s3-171-setup.sql: Marcus's closed events.
--
-- Pre-condition for TC-S3-171 (closed events cannot be reassigned). Load
-- AFTER tc-s3-159-setup.sql.
--
--   EVT-297 COMPLETED; EVT-298 CANCELLED; EVT-299 REJECTED (all Marcus)

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "submittedAt", "createdAt", "updatedAt") VALUES
  ('EVT-297', 'USR-028', 'USR-030', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 99, 'COMPLETED'::"EventStatus", '2030-01-01 00:00:00', '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-298', 'USR-028', 'USR-030', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 99, 'CANCELLED'::"EventStatus", '2030-01-01 00:00:00', '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-299', 'USR-028', 'USR-030', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 99, 'REJECTED'::"EventStatus", '2030-01-01 00:00:00', '2026-09-02 09:00:00', '2026-09-02 09:00:00');
