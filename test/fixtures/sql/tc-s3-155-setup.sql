-- tc-s3-155-setup.sql: a pending morning request for Main Hall.
--
-- Pre-condition for TC-S3-155. Load AFTER tc-s3-154-setup.sql.
--
--   BKG-156 REQUESTED Main Hall for "Other", 1 Oct 2030 09:00-12:00 UTC

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "requestedById", "expectedAttendance", "createdAt", "updatedAt") VALUES
  ('BKG-156', 'EVT-279', 'VEN-079', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 'REQUESTED'::"BookingStatus", 'USR-004', 120, '2026-09-03 09:00:00', '2026-09-03 09:00:00');
