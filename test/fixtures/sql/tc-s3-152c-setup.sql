-- tc-s3-152c-setup.sql: the Gala's technical requirements (Story 20 AC-2).
--
-- Pre-condition for TC-S3-152 (a hold carries the technical requirements).
-- Load AFTER tc-s3-152-setup.sql.
--
--   EVT-276: technical support "Lighting technician", facilities STAGE; REQ-014 Spotlight x2

UPDATE "EventRequest" SET "technicalSupportNeeds" = 'Lighting technician', "requiredFacilities" = ARRAY['STAGE']::"Facility"[]
  WHERE "id" = 'EVT-276';

INSERT INTO "EquipmentRequirement" ("id", "eventId", "equipmentType", "quantity", "createdAt", "updatedAt") VALUES
  ('REQ-014', 'EVT-276', 'Spotlight', 2, '2026-09-02 09:00:00', '2026-09-02 09:00:00');
