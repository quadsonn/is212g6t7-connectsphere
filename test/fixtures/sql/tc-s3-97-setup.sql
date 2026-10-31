-- tc-s3-97-setup.sql: Fair takes 2 of the 4 laser projectors.
--
-- Load AFTER tc-s3-94-setup.sql (TC-S3-97: the alternative is no longer free when accepted).
--
--   RSV-056  Fair, 2 x Laser projector, APPROVED, 1 Oct 2030 09:00-17:00 UTC

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-056', 'EVT-323', 'EQP-035', 2, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'APPROVED'::"ReservationStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
