-- tc-s4-104e-setup.sql: a reservation already released.
--
-- Pre-condition for TC-S4-104 (nothing live to release). Load AFTER tc-s4-104-setup.sql.
--
--   RSV-037: 2 projectors for EVT-312, 1 Oct 2030 10:00-12:00 UTC, RELEASED

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-037', 'EVT-312', 'EQP-025', 2, '2030-10-01 10:00:00', '2030-10-01 12:00:00', 'RELEASED'::"ReservationStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
