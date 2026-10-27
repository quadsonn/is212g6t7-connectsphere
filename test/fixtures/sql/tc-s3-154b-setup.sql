-- tc-s3-154b-setup.sql: the Gala has Main Hall confirmed.
--
-- Pre-condition for TC-S3-154 and 156. Load AFTER tc-s3-152-setup.sql.
--
--   BKG-154 APPROVED Main Hall for the Gala, 1 Oct 2030 18:00-22:00 UTC

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "requestedById", "expectedAttendance", "createdAt", "updatedAt") VALUES
  ('BKG-154', 'EVT-276', 'VEN-079', '2030-10-01 18:00:00', '2030-10-01 22:00:00', 'APPROVED'::"BookingStatus", 'USR-004', 120, '2026-09-03 09:00:00', '2026-09-03 09:00:00');
