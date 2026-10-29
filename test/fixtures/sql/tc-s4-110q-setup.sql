-- tc-s4-110q-setup.sql: a second set of handheld microphones.
--
-- Pre-condition for TC-S4-110 (two alternatives of the same type are listed in
-- a fixed order). Load AFTER tc-s4-110f-setup.sql.
--
--   EQP-032 "Handheld microphone" x4, AV Store

INSERT INTO "Equipment" ("id", "type", "totalQuantity", "location", "createdAt", "updatedAt") VALUES
  ('EQP-032', 'Handheld microphone', 4, 'AV Store', '2026-09-01 09:00:00', '2026-09-01 09:00:00');
