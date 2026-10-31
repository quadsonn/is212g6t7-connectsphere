-- tc-s3-177b-setup.sql: a pending request for Main Hall.
--
-- Pre-condition for TC-S3-177 (nothing is ready while a booking is pending).
-- Load AFTER tc-s3-177-setup.sql.
--
--   BKG-161 REQUESTED Main Hall for EVT-300, 2 Oct 2030 09:00-13:00 UTC

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-161', 'EVT-300', 'VEN-082', '2030-10-02 09:00:00', '2030-10-02 13:00:00', 'REQUESTED'::"BookingStatus", 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
