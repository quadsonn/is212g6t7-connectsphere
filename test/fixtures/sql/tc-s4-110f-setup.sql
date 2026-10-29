-- tc-s4-110f-setup.sql: three handheld microphones.
--
-- Pre-condition for TC-S4-110 (two reservations would overdraw one alternative). Load AFTER tc-s4-110-setup.sql.
--
--   EQP-029 "Handheld microphone" x3

INSERT INTO "Equipment" ("id", "type", "totalQuantity", "location", "createdAt", "updatedAt") VALUES
  ('EQP-029', 'Handheld microphone', 3, 'AV Store', '2026-09-01 09:00:00', '2026-09-01 09:00:00');
