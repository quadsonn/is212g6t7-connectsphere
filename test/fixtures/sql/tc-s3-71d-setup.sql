-- tc-s3-71d-setup.sql: a free-text equipment line, not yet checked.
--
-- Pre-condition for TC-S3-70, 71 and 72 (manual confirmation) (Story 42). Load AFTER tc-s3-70-setup.sql.
--
--   REQ-011   1 x "Stage lighting rig" (free text)

INSERT INTO "EquipmentRequirement" ("id", "eventId", "equipmentId", "equipmentType", "quantity", "createdAt", "updatedAt") VALUES
  ('REQ-011', 'EVT-203', NULL, 'Stage lighting rig', 1, '2026-09-03 09:00:00', '2026-09-03 09:00:00');
