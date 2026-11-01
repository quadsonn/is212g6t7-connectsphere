-- tc-s3-120c-setup.sql: rival's clashing mainHall booking is released (loaded mid-test).
--
-- Pre-condition for TC-S3-120, TC-S3-121 (re-check after the conflict clears) (Story 48). Load AFTER tc-s3-114-setup.sql.
-- Times are UTC; the event runs 01:00-05:00 on 1 Oct 2030 and a request moves
-- it to the same time on 2 Oct.
--
--   BKG-115 -> RELEASED

UPDATE "VenueBooking" SET "status" = 'RELEASED'::"BookingStatus" WHERE "id" = 'BKG-115';
