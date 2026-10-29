-- tc-s4-110l-setup.sql: the lapel microphones are under maintenance.
--
-- Pre-condition for TC-S4-110 (an alternative that is itself out of service). Load AFTER tc-s4-110-setup.sql.
--
--   EQP-027: UNDER_MAINTENANCE

UPDATE "Equipment" SET "operationalStatus" = 'UNDER_MAINTENANCE'::"EquipmentStatus" WHERE "id" = 'EQP-027';
