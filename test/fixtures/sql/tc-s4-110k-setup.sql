-- tc-s4-110k-setup.sql: the gala is REJECTED.
--
-- Pre-condition for TC-S4-107 / 110. Load AFTER tc-s4-110-setup.sql.
--
--   EVT-313: REJECTED

UPDATE "EventRequest" SET "status" = 'REJECTED'::"EventStatus" WHERE "id" = 'EVT-313';
