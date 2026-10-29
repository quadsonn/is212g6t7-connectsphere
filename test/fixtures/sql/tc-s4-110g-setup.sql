-- tc-s4-110g-setup.sql: more items for the replacement dropdown.
--
-- Pre-condition for TC-S4-110 (the dropdown lists items free in full, same type first, never one out of service). Load AFTER tc-s4-110-setup.sql and tc-s4-110e-setup.sql.
--
--   EQP-030 "wireless microphone" x5
--   EQP-031 "Boundary microphone" x10, OUT_OF_SERVICE

INSERT INTO "Equipment" ("id", "type", "totalQuantity", "location", "operationalStatus", "createdAt", "updatedAt") VALUES
  ('EQP-030', 'wireless microphone', 5, 'AV Store', 'OPERATIONAL'::"EquipmentStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('EQP-031', 'Boundary microphone', 10, 'AV Store', 'OUT_OF_SERVICE'::"EquipmentStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
