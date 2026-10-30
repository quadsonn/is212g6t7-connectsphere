-- tc-s3-157b-setup.sql: a live morning hold on Main Hall.
--
-- Pre-condition for TC-S3-157 and the database backstop. Load AFTER tc-s3-152-setup.sql.
--
--   BKG-158 HELD Main Hall for the Gala, 1 Oct 2030 09:00-12:00 UTC, held by Vera, expires now + 48 hours

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "holdExpiresAt", "heldById", "createdAt", "updatedAt") VALUES
  ('BKG-158', 'EVT-276', 'VEN-079', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 'HELD'::"BookingStatus", (now() AT TIME ZONE 'UTC') + interval '48 hours', 'USR-010', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
