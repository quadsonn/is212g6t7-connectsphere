-- tc-s3-130i-setup.sql: "existing" has plain 19:00-23:30.
--
-- Pre-condition for the click-through search test (Story 50). Load AFTER tc-s3-130-setup.sql.
-- Times are UTC on 1 Oct 2030 unless stated.
--
--   BKG-131 APPROVED plain 19:00-23:30

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "createdAt", "updatedAt") VALUES
  ('BKG-131', 'EVT-253', 'VEN-069', '2030-10-01 19:00:00', '2030-10-01 23:30:00', 'APPROVED'::"BookingStatus", 50, '2026-09-03 09:00:00', '2026-09-03 09:00:00');
