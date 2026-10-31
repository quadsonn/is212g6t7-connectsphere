-- tc-s3-152b-setup.sql: a draft, which cannot be held for.
--
-- Pre-condition for TC-S3-152 (the holdable-events list). Load AFTER tc-s3-152-setup.sql.
--
--   EVT-277 "Draft" DRAFT, same time as the Gala

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-277', 'USR-006', 'USR-004', 'Draft', 'Celebrate', 'An evening', 'Social', '2030-10-01 18:00:00', '2030-10-01 22:00:00', 120, 'DRAFT'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
