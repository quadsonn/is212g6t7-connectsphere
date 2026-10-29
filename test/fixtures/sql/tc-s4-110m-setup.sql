-- tc-s4-110m-setup.sql: the wireless microphones were taken out of service before the gala was confirmed.
--
-- Pre-condition for TC-S4-110 (answering afterwards). Load AFTER tc-s4-110-setup.sql.
--
--   EQP-026: OUT_OF_SERVICE

UPDATE "Equipment" SET "operationalStatus" = 'OUT_OF_SERVICE'::"EquipmentStatus" WHERE "id" = 'EQP-026';
