-- tc-s3-162b-setup.sql: the request has left the queue (Marcus has it).
--
-- Pre-condition for TC-S3-162 (a request that has left the queue cannot be
-- opened from it). Load AFTER tc-s3-160-setup.sql.
--
--   EVT-283: Coordinator Marcus (still SUBMITTED)

UPDATE "EventRequest" SET "coordinatorId" = 'USR-030' WHERE "id" = 'EVT-283';
