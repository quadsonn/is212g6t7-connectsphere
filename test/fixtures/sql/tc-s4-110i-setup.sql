-- tc-s4-110i-setup.sql: the gala is COMPLETED.
--
-- Pre-condition for TC-S4-107 / 110. Load AFTER tc-s4-110-setup.sql.
--
--   EVT-313: COMPLETED

UPDATE "EventRequest" SET "status" = 'COMPLETED'::"EventStatus" WHERE "id" = 'EVT-313';
