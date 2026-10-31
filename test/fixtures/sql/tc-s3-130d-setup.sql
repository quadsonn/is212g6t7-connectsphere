-- tc-s3-130d-setup.sql: "existing" has plain 15:00-15:45.
--
-- Pre-condition for TC-S3-130 (Story 50). Load AFTER tc-s3-130-setup.sql.
-- Times are UTC on 1 Oct 2030 unless stated.
--
--   BKG-124 APPROVED plain 15:00-15:45

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "createdAt", "updatedAt") VALUES
  ('BKG-124', 'EVT-253', 'VEN-069', '2030-10-01 15:00:00', '2030-10-01 15:45:00', 'APPROVED'::"BookingStatus", 50, '2026-09-03 09:00:00', '2026-09-03 09:00:00');
