-- tc-s4-76c-setup.sql: Wei is already assigned to the Town Hall.
--
-- Pre-condition for TC-S4-76 (change or remove an assignment). Load AFTER tc-s4-76b-setup.sql.
--
--   EVT-304: technicalSupportId = USR-042 (Wei)

UPDATE "EventRequest" SET "technicalSupportId" = 'USR-042' WHERE "id" = 'EVT-304';
