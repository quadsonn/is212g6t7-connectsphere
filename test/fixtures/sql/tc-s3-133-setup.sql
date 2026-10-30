-- tc-s3-133-setup.sql: "existing" has plain 10:00-12:00.
--
-- Pre-condition for TC-S3-133, 134 (Story 50). Load AFTER tc-s3-130-setup.sql.
-- Times are UTC on 1 Oct 2030 unless stated.
--
--   BKG-121 APPROVED plain 10:00-12:00

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "createdAt", "updatedAt") VALUES
  ('BKG-121', 'EVT-253', 'VEN-069', '2030-10-01 10:00:00', '2030-10-01 12:00:00', 'APPROVED'::"BookingStatus", 50, '2026-09-03 09:00:00', '2026-09-03 09:00:00');
