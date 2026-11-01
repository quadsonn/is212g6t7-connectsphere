-- tc-s3-88b-setup.sql: one item, all 10 units working.
--
-- Pre-condition for every test in test/equipment-status.e2e-spec.ts
-- (Story 45, TC-S3-88 to 93). Load AFTER tc-s3-88-setup.sql.
--
--   EQP-033  Wireless microphone x10, AV Store

INSERT INTO "Equipment" ("id", "type", "totalQuantity", "location", "createdAt", "updatedAt") VALUES
  ('EQP-033', 'Wireless microphone', 10, 'AV Store', '2026-09-01 09:00:00', '2026-09-01 09:00:00');
