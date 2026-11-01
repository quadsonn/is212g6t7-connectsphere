-- tc-s3-161-setup.sql: three queued requests submitted a month apart.
--
-- Pre-condition for TC-S3-161 (oldest first). Load AFTER tc-s3-159-setup.sql.
-- Inserted newest first, so ID order is not submission order.
--
--   EVT-284 "Newest" submitted 1 Mar 2030; EVT-285 "Oldest" 1 Jan 2030; EVT-286 "Middle" 1 Feb 2030

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "submittedAt", "createdAt", "updatedAt") VALUES
  ('EVT-284', 'USR-028', NULL, 'Newest', 'Welcome new students', 'Full-day programme', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 99, 'SUBMITTED'::"EventStatus", '2030-03-01 00:00:00', '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-285', 'USR-028', NULL, 'Oldest', 'Welcome new students', 'Full-day programme', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 99, 'SUBMITTED'::"EventStatus", '2030-01-01 00:00:00', '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-286', 'USR-028', NULL, 'Middle', 'Welcome new students', 'Full-day programme', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 99, 'SUBMITTED'::"EventStatus", '2030-02-01 00:00:00', '2026-09-02 09:00:00', '2026-09-02 09:00:00');
