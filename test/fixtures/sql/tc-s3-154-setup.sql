-- tc-s3-154-setup.sql: a second event in planning, competing for Main Hall.
--
-- Pre-condition for TC-S3-154 to 158. Load AFTER tc-s3-152-setup.sql.
--
--   EVT-279 "Other" PLANNING, USR-006 / USR-004, same time as the Gala

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-279', 'USR-006', 'USR-004', 'Other', 'Celebrate', 'An evening', 'Social', '2030-10-01 18:00:00', '2030-10-01 22:00:00', 120, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
