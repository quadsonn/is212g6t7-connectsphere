-- tc-s2-72-setup.sql: a projector reservation for the tc-s2-68 event, already APPROVED.
--
-- Pre-condition for TC-S2-72 (Story 24 AC-2). Load AFTER base-users.sql and
-- tc-s2-68-setup.sql.
--
--   EQP-006  "Projector", 4 in stock
--   RSV-014  APPROVED, 2 projectors for EVT-105, 1 Oct 2030 08:00-18:00 UTC

INSERT INTO "Equipment" ("id", "type", "totalQuantity", "createdAt", "updatedAt") VALUES
  ('EQP-006', 'Projector', 4, '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-014', 'EVT-105', 'EQP-006', 2, '2030-10-01 08:00:00', '2030-10-01 18:00:00', 'APPROVED'::"ReservationStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
