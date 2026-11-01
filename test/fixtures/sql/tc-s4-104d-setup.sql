-- tc-s4-104d-setup.sql: 2 projectors reserved for the Town Hall.
--
-- Pre-condition for TC-S4-104 and 105. Load AFTER tc-s4-104-setup.sql.
--
--   RSV-037: 2 projectors for EVT-312, 1 Oct 2030 10:00-12:00 UTC, APPROVED

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-037', 'EVT-312', 'EQP-025', 2, '2030-10-01 10:00:00', '2030-10-01 12:00:00', 'APPROVED'::"ReservationStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
