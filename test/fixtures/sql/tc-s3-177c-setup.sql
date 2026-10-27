-- tc-s3-177c-setup.sql: a second pending request for Main Hall, on another day.
--
-- Pre-condition for TC-S3-177 (one of two bookings still pending) and
-- TC-S3-185 (a new booking that is not approved yet). Load AFTER tc-s3-177-setup.sql.
--
--   BKG-162 REQUESTED Main Hall for EVT-300, 3 Oct 2030 09:00-13:00 UTC

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-162', 'EVT-300', 'VEN-082', '2030-10-03 09:00:00', '2030-10-03 13:00:00', 'REQUESTED'::"BookingStatus", 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
