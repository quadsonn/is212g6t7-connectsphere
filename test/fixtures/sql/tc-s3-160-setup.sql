-- tc-s3-160-setup.sql: one request waiting in the unassigned queue.
--
-- Pre-condition for most tests of Story 55 (TC-S3-160 to 167). Load AFTER
-- tc-s3-159-setup.sql.
--
--   EVT-283 "Freshman Orientation 2030" SUBMITTED, no Coordinator, by Olive, 1 Oct 2030 09:00-17:00 UTC,
--           99 people, category "Student engagement", submitted 1 Jan 2030 00:00 UTC

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "submittedAt", "createdAt", "updatedAt") VALUES
  ('EVT-283', 'USR-028', NULL, 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 99, 'SUBMITTED'::"EventStatus", '2030-01-01 00:00:00', '2026-09-02 09:00:00', '2026-09-02 09:00:00');
