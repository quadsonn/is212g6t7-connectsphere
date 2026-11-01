-- tc-s4-104b-setup.sql: nobody is assigned to the Town Hall.
--
-- Pre-condition for TC-S4-104 to 106 (no assignee). Load AFTER tc-s4-104-setup.sql.
--
--   EVT-312: technicalSupportId = NULL

UPDATE "EventRequest" SET "technicalSupportId" = NULL WHERE "id" = 'EVT-312';
