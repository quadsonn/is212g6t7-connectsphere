-- tc-s4-104c-setup.sql: Nadia, not Wei, is assigned to the Town Hall.
--
-- Pre-condition for TC-S4-106 (only the assignee is told). Load AFTER tc-s4-104-setup.sql.
--
--   EVT-312: technicalSupportId = 'USR-043'

UPDATE "EventRequest" SET "technicalSupportId" = 'USR-043' WHERE "id" = 'EVT-312';
