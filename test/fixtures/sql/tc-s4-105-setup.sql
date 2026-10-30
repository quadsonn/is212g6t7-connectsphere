-- tc-s4-105-setup.sql: the Town Hall is confirmed.
--
-- Pre-condition for TC-S4-105 (an approved change rebooks it). Load AFTER tc-s4-104-setup.sql.
--
--   EVT-312: status = 'CONFIRMED'::EventStatus

UPDATE "EventRequest" SET "status" = 'CONFIRMED'::"EventStatus" WHERE "id" = 'EVT-312';
