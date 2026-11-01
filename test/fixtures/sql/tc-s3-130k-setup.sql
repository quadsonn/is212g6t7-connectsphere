-- tc-s3-130k-setup.sql: "existing" has hall 11:00-15:30 (19:00-23:30 Singapore time).
--
-- Pre-condition for the click-through AC-1 test (Story 50). Load AFTER tc-s3-130-setup.sql.
-- Times are UTC on 1 Oct 2030 unless stated.
--
--   BKG-133 APPROVED hall 11:00-15:30

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "createdAt", "updatedAt") VALUES
  ('BKG-133', 'EVT-253', 'VEN-068', '2030-10-01 11:00:00', '2030-10-01 15:30:00', 'APPROVED'::"BookingStatus", 50, '2026-09-03 09:00:00', '2026-09-03 09:00:00');
