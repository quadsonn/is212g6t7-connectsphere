-- tc-s3-63b-setup.sql: the Showcase's Main Hall request is already APPROVED.
--
-- Pre-condition for TC-S3-63 (Story 41 AC-1: alternatives attached when a
-- reversal rejects an approved booking). Load AFTER tc-s3-63-setup.sql.
--
--   BKG-082   APPROVED

UPDATE "VenueBooking" SET "status" = 'APPROVED'::"BookingStatus" WHERE "id" = 'BKG-082';
