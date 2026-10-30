-- tc-s3-130b-setup.sql: "existing" has only requested hall 10:00-12:00.
--
-- Pre-condition for TC-S3-132, 134 (Story 50). Load AFTER tc-s3-130-setup.sql.
-- Times are UTC on 1 Oct 2030 unless stated.
--
--   BKG-122 REQUESTED hall 10:00-12:00

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "createdAt", "updatedAt") VALUES
  ('BKG-122', 'EVT-253', 'VEN-068', '2030-10-01 10:00:00', '2030-10-01 12:00:00', 'REQUESTED'::"BookingStatus", 50, '2026-09-03 09:00:00', '2026-09-03 09:00:00');
