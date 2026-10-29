-- tc-s4-110e-setup.sql: one handheld microphone.
--
-- Pre-condition for TC-S4-110 (an alternative too small to cover the reservation). Load AFTER tc-s4-110-setup.sql.
--
--   EQP-028 "Handheld microphone" x1

INSERT INTO "Equipment" ("id", "type", "totalQuantity", "location", "createdAt", "updatedAt") VALUES
  ('EQP-028', 'Handheld microphone', 1, 'AV Store', '2026-09-01 09:00:00', '2026-09-01 09:00:00');
