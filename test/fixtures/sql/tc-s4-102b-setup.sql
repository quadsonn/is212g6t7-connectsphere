-- tc-s4-102b-setup.sql: the Careers Fair has already taken place.
--
-- Pre-condition for TC-S4-102 (a refused cancellation sends nothing). Load
-- AFTER tc-s4-102-setup.sql.
--
--   EVT-311: COMPLETED

UPDATE "EventRequest" SET "status" = 'COMPLETED'::"EventStatus" WHERE "id" = 'EVT-311';
