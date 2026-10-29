-- tc-s4-110h-setup.sql: the gala's microphone reservation is only requested.
--
-- Pre-condition for TC-S4-110. Load AFTER tc-s4-110-setup.sql.
--
--   RSV-038: REQUESTED

UPDATE "EquipmentReservation" SET "status" = 'REQUESTED'::"ReservationStatus" WHERE "id" = 'RSV-038';
