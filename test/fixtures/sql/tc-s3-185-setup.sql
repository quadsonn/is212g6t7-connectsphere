-- tc-s3-185-setup.sql: the event is cancelled while safety feedback waits for an answer.
--
-- Pre-condition for TC-S3-185 (a cancelled event cannot be sent back for a
-- check). Load AFTER tc-s3-177e-setup.sql, once changes have been requested.
--
--   EVT-300: CANCELLED

UPDATE "EventRequest" SET "status" = 'CANCELLED'::"EventStatus" WHERE "id" = 'EVT-300';
