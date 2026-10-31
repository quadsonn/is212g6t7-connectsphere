-- tc-s3-73b-setup.sql: the event is AWAITING_ARRANGEMENTS.
--
-- Pre-condition for TC-S3-73 (Story 42). Load AFTER tc-s3-70-setup.sql.
--
--   EVT-203   status AWAITING_ARRANGEMENTS

UPDATE "EventRequest" SET "status" = 'AWAITING_ARRANGEMENTS'::"EventStatus" WHERE "id" = 'EVT-203';
