-- tc-s3-157c-setup.sql: a pending request inside the live morning hold.
--
-- Pre-condition for the database backstop test (a constraint violation is a 409).
-- Load AFTER tc-s3-154-setup.sql and tc-s3-157b-setup.sql.
--
--   BKG-159 REQUESTED Main Hall for "Other", 1 Oct 2030 10:00-11:00 UTC

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "requestedById", "expectedAttendance", "createdAt", "updatedAt") VALUES
  ('BKG-159', 'EVT-279', 'VEN-079', '2030-10-01 10:00:00', '2030-10-01 11:00:00', 'REQUESTED'::"BookingStatus", 'USR-004', 120, '2026-09-03 09:00:00', '2026-09-03 09:00:00');
