-- tc-s3-56-setup.sql: an East Annex request for the Gala that was REJECTED.
--
-- Pre-condition for TC-S3-56 (Story 40 AC-1/AC-2: a cancellation is reported
-- only for live bookings). Load AFTER tc-s3-54-setup.sql and tc-s3-55-setup.sql.
--
--   BKG-081   REJECTED East Annex (VEN-039) for EVT-194, 1 Oct 2030 18:00-22:00 UTC

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-081', 'EVT-194', 'VEN-039', '2030-10-01 18:00:00', '2030-10-01 22:00:00', 'REJECTED'::"BookingStatus", 120, 'USR-004', '2026-09-03 09:00:00', '2026-09-04 09:00:00');
