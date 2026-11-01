-- tc-s3-158-setup.sql: an event in planning with no Coordinator yet.
--
-- Pre-condition for TC-S3-158 (the Coordinator Leads are told instead).
-- Load AFTER tc-s3-152-setup.sql.
--
--   EVT-280 "Unassigned" PLANNING, no Coordinator, same time as the Gala

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-280', 'USR-006', NULL, 'Unassigned', 'Celebrate', 'An evening', 'Social', '2030-10-01 18:00:00', '2030-10-01 22:00:00', 120, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
