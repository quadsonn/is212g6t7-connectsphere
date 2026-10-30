-- tc-s3-93-setup.sql: Gala holds 9 of the 10 microphones.
--
-- Load AFTER tc-s3-92-setup.sql (TC-S3-93; TC-S4-107).
--
--   RSV-043  Gala, 9 x EQP-033, APPROVED, 1 Oct 2030 09:00-17:00 UTC

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-043', 'EVT-317', 'EQP-033', 9, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'APPROVED'::"ReservationStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
