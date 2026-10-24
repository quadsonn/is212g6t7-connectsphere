-- tc-s2-97-setup.sql: a small equipment catalogue.
--
-- Pre-condition for TC-S2-97 (Story 28 AC-1), and for TC-S2-98 to TC-S2-101.
-- Load AFTER base-users.sql.
--
--   EQP-004           "Wireless microphone"  24  "Handheld UHF mic."   AV Store, Level 1   OPERATIONAL
--   EQP-007  "Projector (4K)"        8  "Ceiling-mountable."  AV Store, Level 2   UNDER_MAINTENANCE
--   EQP-012         "Folding table"        40  (no description)      (no location)       OPERATIONAL

INSERT INTO "Equipment" ("id", "type", "description", "location", "totalQuantity", "operationalStatus", "createdAt", "updatedAt") VALUES
  ('EQP-004', 'Wireless microphone', 'Handheld UHF mic.', 'AV Store, Level 1', 24, 'OPERATIONAL'::"EquipmentStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('EQP-007', 'Projector (4K)', 'Ceiling-mountable.', 'AV Store, Level 2', 8, 'UNDER_MAINTENANCE'::"EquipmentStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('EQP-012', 'Folding table', NULL, NULL, 40, 'OPERATIONAL'::"EquipmentStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
