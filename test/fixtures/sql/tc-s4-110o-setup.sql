-- tc-s4-110o-setup.sql: the wireless microphones are back in service.
--
-- Pre-condition for TC-S4-110 (nothing to answer for an item in service). Load AFTER tc-s4-110m-setup.sql.
--
--   EQP-026: OPERATIONAL

UPDATE "Equipment" SET "operationalStatus" = 'OPERATIONAL'::"EquipmentStatus" WHERE "id" = 'EQP-026';
