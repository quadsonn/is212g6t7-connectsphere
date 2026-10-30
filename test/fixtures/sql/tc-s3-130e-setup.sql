-- tc-s3-130e-setup.sql: hall without buffers yet, holding two back-to-back approved bookings.
--
-- Pre-condition for the "existing bookings are not changed" test (TC-S3-131) (Story 50). Load AFTER tc-s3-130-setup.sql.
-- Times are UTC on 1 Oct 2030 unless stated.
--
--   VEN-068 buffers 0/0 for now
--   BKG-127 "existing" 10:00-12:00 and BKG-128 "newEvent" 12:00-13:00, both APPROVED

UPDATE "Venue" SET "setupMinutes" = 0, "turnaroundMinutes" = 0 WHERE "id" = 'VEN-068';

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "createdAt", "updatedAt") VALUES
  ('BKG-127', 'EVT-253', 'VEN-068', '2030-10-01 10:00:00', '2030-10-01 12:00:00', 'APPROVED'::"BookingStatus", 50, '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-128', 'EVT-254', 'VEN-068', '2030-10-01 12:00:00', '2030-10-01 13:00:00', 'APPROVED'::"BookingStatus", 50, '2026-09-03 09:00:00', '2026-09-03 09:00:00');
