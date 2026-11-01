-- tc-s3-130h-setup.sql: "existing" has hall 19:00-23:30 (the click-through evening booking).
--
-- Pre-condition for the click-through tests (TC-S3-130 to 134) (Story 50). Load AFTER tc-s3-130-setup.sql.
-- Times are UTC on 1 Oct 2030 unless stated.
--
--   BKG-130 APPROVED hall 19:00-23:30

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "createdAt", "updatedAt") VALUES
  ('BKG-130', 'EVT-253', 'VEN-068', '2030-10-01 19:00:00', '2030-10-01 23:30:00', 'APPROVED'::"BookingStatus", 50, '2026-09-03 09:00:00', '2026-09-03 09:00:00');
