-- tc-s3-93c-setup.sql: "Last year", over, with all 10 microphones reserved.
--
-- Load AFTER tc-s3-88-setup.sql + tc-s3-88b-setup.sql (TC-S3-93; TC-S4-107).
--
--   EVT-319  "Last year" PLANNING, coordinator's (USR-048), 1 Oct 2020 09:00-17:00 UTC
--   RSV-045  Last year, 10 x EQP-033, APPROVED, 1 Oct 2020 09:00-17:00 UTC

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "equipmentNeeds", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-319', 'USR-051', 'USR-048', 'Microphones.', 'Last year', 'Purpose', 'Description', 'Conference', '2020-10-01 09:00:00', '2020-10-01 17:00:00', 100, 'PLANNING'::"EventStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-045', 'EVT-319', 'EQP-033', 10, '2020-10-01 09:00:00', '2020-10-01 17:00:00', 'APPROVED'::"ReservationStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
