-- tc-s4-110j-setup.sql: the gala is CANCELLED.
--
-- Pre-condition for TC-S4-107 / 110. Load AFTER tc-s4-110-setup.sql.
--
--   EVT-313: CANCELLED

UPDATE "EventRequest" SET "status" = 'CANCELLED'::"EventStatus" WHERE "id" = 'EVT-313';
