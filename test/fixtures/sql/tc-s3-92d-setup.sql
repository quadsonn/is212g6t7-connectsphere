-- tc-s3-92d-setup.sql: "Conference", confirmed, on 1 Oct 2030 (for a change request check).
--
-- Load AFTER tc-s3-88-setup.sql + tc-s3-88b-setup.sql (TC-S3-92, Story 48's check).
--
--   EVT-321  "Conference" CONFIRMED, organiser's (USR-051), coordinator's (USR-048), 1 Oct 2030 09:00-17:00 UTC

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-321', 'USR-051', 'USR-048', 'Conference', 'p', 'd', 'c', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'CONFIRMED'::"EventStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
