-- tc-s3-92-setup.sql: "Gala", in planning, on 1 Oct 2030.
--
-- Load AFTER tc-s3-88-setup.sql + tc-s3-88b-setup.sql (TC-S3-92, 93; TC-S4-107).
--
--   EVT-317  "Gala" PLANNING, organiser's (USR-051), coordinator's (USR-048), 1 Oct 2030 09:00-17:00 UTC

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "equipmentNeeds", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-317', 'USR-051', 'USR-048', 'Microphones.', 'Gala', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'PLANNING'::"EventStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
