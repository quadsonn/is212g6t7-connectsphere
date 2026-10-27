-- tc-s3-152d-setup.sql: Main Hall is taken back to draft.
--
-- Pre-condition for TC-S3-152 (a draft venue cannot be held). Load AFTER
-- tc-s3-152-setup.sql.
--
--   VEN-079 Main Hall: DRAFT

UPDATE "Venue" SET "status" = 'DRAFT'::"VenueStatus" WHERE "id" = 'VEN-079';
