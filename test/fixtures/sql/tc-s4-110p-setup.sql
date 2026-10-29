-- tc-s4-110p-setup.sql: the gala's microphone reservation has been released.
--
-- Pre-condition for TC-S4-110 (no answer for a reservation that is no longer
-- active). Load AFTER tc-s4-110-setup.sql.
--
--   RSV-038: RELEASED

UPDATE "EquipmentReservation" SET "status" = 'RELEASED'::"ReservationStatus", "releasedAt" = '2026-09-05 09:00:00' WHERE "id" = 'RSV-038';
