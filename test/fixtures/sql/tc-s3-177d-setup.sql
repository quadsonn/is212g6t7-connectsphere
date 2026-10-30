-- tc-s3-177d-setup.sql: the event needs 4 microphones (none reserved yet).
--
-- Pre-condition for TC-S3-177 (requested equipment must be reserved). Load
-- AFTER tc-s3-177-setup.sql.
--
--   REQ-015 EVT-300 needs 4 Wireless microphones (EQP-022)

INSERT INTO "EquipmentRequirement" ("id", "eventId", "equipmentId", "equipmentType", "quantity", "createdAt", "updatedAt") VALUES
  ('REQ-015', 'EVT-300', 'EQP-022', 'Wireless microphone', 4, '2026-09-02 09:00:00', '2026-09-02 09:00:00');
