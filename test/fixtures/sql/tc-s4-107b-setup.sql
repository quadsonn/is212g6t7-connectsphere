-- tc-s4-107b-setup.sql: Gala holds 5 of the 10 microphones.
--
-- Load AFTER tc-s3-92-setup.sql (Story 67, TC-S4-107).
--
--   RSV-051  Gala, 5 x EQP-033, APPROVED, 1 Oct 2030 09:00-17:00 UTC

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-051', 'EVT-317', 'EQP-033', 5, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'APPROVED'::"ReservationStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
