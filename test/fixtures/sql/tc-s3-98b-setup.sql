-- tc-s3-98b-setup.sql: "Last year", completed, with 4 projectors reserved.
--
-- Load AFTER tc-s3-94-setup.sql (TC-S3-98).
--
--   EVT-325  "Last year" COMPLETED, 1 Oct 2020 09:00-17:00 UTC; RSV-055 4 x Projector, APPROVED

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "technicalSupportId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-325', 'USR-051', 'USR-048', 'USR-047', 'Last year', 'p', 'd', 'c', '2020-10-01 09:00:00', '2020-10-01 17:00:00', 100, 'COMPLETED'::"EventStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-055', 'EVT-325', 'EQP-034', 4, '2020-10-01 09:00:00', '2020-10-01 17:00:00', 'APPROVED'::"ReservationStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
