-- tc-s3-159b-setup.sql: a draft, and a request already assigned to Marcus.
--
-- Pre-condition for TC-S3-159 (neither is queued) and TC-S3-163 (a draft
-- cannot be assigned). Load AFTER tc-s3-159-setup.sql.
--
--   EVT-281 DRAFT, never submitted; EVT-282 PLANNING, Coordinator Marcus

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "submittedAt", "createdAt", "updatedAt") VALUES
  ('EVT-281', 'USR-028', NULL, 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 99, 'DRAFT'::"EventStatus", NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-282', 'USR-028', 'USR-030', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 99, 'PLANNING'::"EventStatus", '2030-01-01 00:00:00', '2026-09-02 09:00:00', '2026-09-02 09:00:00');
