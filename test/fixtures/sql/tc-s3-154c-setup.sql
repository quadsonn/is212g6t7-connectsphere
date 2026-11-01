-- tc-s3-154c-setup.sql: the Gala has a pending request for Main Hall.
--
-- Pre-condition for TC-S3-154 (a hold over a pending request is a soft warning).
-- Load AFTER tc-s3-152-setup.sql.
--
--   BKG-155 REQUESTED Main Hall for the Gala, 1 Oct 2030 18:00-22:00 UTC

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "requestedById", "expectedAttendance", "createdAt", "updatedAt") VALUES
  ('BKG-155', 'EVT-276', 'VEN-079', '2030-10-01 18:00:00', '2030-10-01 22:00:00', 'REQUESTED'::"BookingStatus", 'USR-004', 120, '2026-09-03 09:00:00', '2026-09-03 09:00:00');
