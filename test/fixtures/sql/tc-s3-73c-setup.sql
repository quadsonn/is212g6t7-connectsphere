-- tc-s3-73c-setup.sql: the event is only APPROVED, not yet in planning.
--
-- Pre-condition for TC-S3-73 (cannot be confirmed) (Story 42). Load AFTER tc-s3-70-setup.sql.
--
--   EVT-203   status APPROVED

UPDATE "EventRequest" SET "status" = 'APPROVED'::"EventStatus" WHERE "id" = 'EVT-203';
