-- tc-s3-168-setup.sql: Marcus's events, active and closed, and one still queued.
--
-- Pre-condition for TC-S3-168 (the assignments view). Load AFTER tc-s3-159-setup.sql.
--
--   EVT-288 "Later" PLANNING 1 Dec 2030; EVT-289 "Sooner" CONFIRMED 1 Nov 2030 (both Marcus)
--   EVT-290 to 292 "Closed COMPLETED/CANCELLED/REJECTED" (Marcus); EVT-293 "Queued" SUBMITTED, unassigned

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "submittedAt", "createdAt", "updatedAt") VALUES
  ('EVT-288', 'USR-028', 'USR-030', 'Later', 'Welcome new students', 'Full-day programme', 'Student engagement', '2030-12-01 09:00:00', '2030-10-01 17:00:00', 99, 'PLANNING'::"EventStatus", '2030-01-01 00:00:00', '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-289', 'USR-028', 'USR-030', 'Sooner', 'Welcome new students', 'Full-day programme', 'Student engagement', '2030-11-01 09:00:00', '2030-10-01 17:00:00', 99, 'CONFIRMED'::"EventStatus", '2030-01-01 00:00:00', '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-290', 'USR-028', 'USR-030', 'Closed COMPLETED', 'Welcome new students', 'Full-day programme', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 99, 'COMPLETED'::"EventStatus", '2030-01-01 00:00:00', '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-291', 'USR-028', 'USR-030', 'Closed CANCELLED', 'Welcome new students', 'Full-day programme', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 99, 'CANCELLED'::"EventStatus", '2030-01-01 00:00:00', '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-292', 'USR-028', 'USR-030', 'Closed REJECTED', 'Welcome new students', 'Full-day programme', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 99, 'REJECTED'::"EventStatus", '2030-01-01 00:00:00', '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-293', 'USR-028', NULL, 'Queued', 'Welcome new students', 'Full-day programme', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 99, 'SUBMITTED'::"EventStatus", '2030-01-01 00:00:00', '2026-09-02 09:00:00', '2026-09-02 09:00:00');
