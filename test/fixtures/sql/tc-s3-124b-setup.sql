-- tc-s3-124b-setup.sql: the Sandbox Auditorium is still a draft.
--
-- Pre-condition for TC-S3-124 (Story 49 AC-1: a draft can be configured too).
-- Load AFTER tc-s3-124-setup.sql.
--
--   VEN-065   status DRAFT

UPDATE "Venue" SET "status" = 'DRAFT'::"VenueStatus" WHERE "id" = 'VEN-065';
