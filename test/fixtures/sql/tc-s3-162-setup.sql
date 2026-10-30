-- tc-s3-162-setup.sql: the queued request's layout.
--
-- Pre-condition for TC-S3-162 (open a queued request). Load AFTER tc-s3-160-setup.sql.
--
--   EVT-283: THEATRE layout, notes "Stage left"

UPDATE "EventRequest" SET "preferredLayout" = 'THEATRE'::"RoomLayout", "layoutNotes" = 'Stage left' WHERE "id" = 'EVT-283';
