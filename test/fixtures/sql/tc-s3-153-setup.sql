-- tc-s3-153-setup.sql: a submitted event, not yet at a planning stage.
--
-- Pre-condition for TC-S3-153. Load AFTER tc-s3-152-setup.sql.
--
--   EVT-278 "Submitted" SUBMITTED, same time as the Gala

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-278', 'USR-006', 'USR-004', 'Submitted', 'Celebrate', 'An evening', 'Social', '2030-10-01 18:00:00', '2030-10-01 22:00:00', 120, 'SUBMITTED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
