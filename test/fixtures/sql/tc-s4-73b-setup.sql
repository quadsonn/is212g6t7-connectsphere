-- tc-s4-73b-setup.sql: the projector is already marked Damaged.
--
-- Pre-condition for TC-S4-73 (returning to Available tells no one). Load AFTER
-- tc-s4-73-setup.sql.
--
--   EQP-023: OUT_OF_SERVICE

UPDATE "Equipment" SET "operationalStatus" = 'OUT_OF_SERVICE'::"EquipmentStatus" WHERE "id" = 'EQP-023';
