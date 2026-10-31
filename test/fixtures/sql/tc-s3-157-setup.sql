-- tc-s3-157-setup.sql: a hold on Main Hall that expired an hour ago and was never released.
--
-- Pre-condition for TC-S3-156 and 157. Load AFTER tc-s3-152-setup.sql.
-- The expiry is relative to the database clock, so it is always in the past.
--
--   BKG-157 HELD Main Hall for the Gala, 1 Oct 2030 18:00-22:00 UTC, held by Vera, expired now - 1 hour

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "holdExpiresAt", "heldById", "createdAt", "updatedAt") VALUES
  ('BKG-157', 'EVT-276', 'VEN-079', '2030-10-01 18:00:00', '2030-10-01 22:00:00', 'HELD'::"BookingStatus", (now() AT TIME ZONE 'UTC') - interval '1 hour', 'USR-010', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
