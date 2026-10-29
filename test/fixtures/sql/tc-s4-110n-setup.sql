-- tc-s4-110n-setup.sql: the gala is PLANNING.
--
-- Pre-condition for TC-S4-107 / 110. Load AFTER tc-s4-110-setup.sql.
--
--   EVT-313: PLANNING

UPDATE "EventRequest" SET "status" = 'PLANNING'::"EventStatus" WHERE "id" = 'EVT-313';
