-- tc-s3-93b-setup.sql: "Fair" the next day, holding 5 microphones.
--
-- Load AFTER tc-s3-93-setup.sql (TC-S3-93, the warning before saving).
--
--   EVT-318  "Fair" PLANNING, coordinator's (USR-048), 2 Oct 2030 09:00-17:00 UTC
--   RSV-044  Fair, 5 x EQP-033, APPROVED, 2 Oct 2030 09:00-17:00 UTC

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "equipmentNeeds", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-318', 'USR-051', 'USR-048', 'Microphones.', 'Fair', 'Purpose', 'Description', 'Conference', '2030-10-02 09:00:00', '2030-10-02 17:00:00', 100, 'PLANNING'::"EventStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-044', 'EVT-318', 'EQP-033', 5, '2030-10-02 09:00:00', '2030-10-02 17:00:00', 'APPROVED'::"ReservationStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
