-- tc-s3-92c-setup.sql: a second item, every unit working.
--
-- Load AFTER tc-s3-88b-setup.sql (TC-S3-92, the catalogue breakdown).
--
--   EQP-037  Projector x4

INSERT INTO "Equipment" ("id", "type", "totalQuantity", "createdAt", "updatedAt") VALUES
  ('EQP-037', 'Projector', 4, '2026-09-01 09:00:00', '2026-09-01 09:00:00');
