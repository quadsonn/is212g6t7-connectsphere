-- tc-s3-131-setup.sql: "existing" has hall 10:00-12:00 (occupying 09:30-12:45).
--
-- Pre-condition for TC-S3-131, 133, 134 and the US-41/US-52 tests (Story 50). Load AFTER tc-s3-130-setup.sql.
-- Times are UTC on 1 Oct 2030 unless stated.
--
--   BKG-120 APPROVED hall 10:00-12:00

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "createdAt", "updatedAt") VALUES
  ('BKG-120', 'EVT-253', 'VEN-068', '2030-10-01 10:00:00', '2030-10-01 12:00:00', 'APPROVED'::"BookingStatus", 50, '2026-09-03 09:00:00', '2026-09-03 09:00:00');
