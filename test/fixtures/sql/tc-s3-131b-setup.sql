-- tc-s3-131b-setup.sql: "newEvent" requested hall 12:30-13:30, inside the turnaround of tc-s3-131's booking.
--
-- Pre-condition for TC-S3-131 (Story 50). Load AFTER tc-s3-130-setup.sql.
-- Times are UTC on 1 Oct 2030 unless stated.
--
--   BKG-125 REQUESTED hall 12:30-13:30

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "createdAt", "updatedAt") VALUES
  ('BKG-125', 'EVT-254', 'VEN-068', '2030-10-01 12:30:00', '2030-10-01 13:30:00', 'REQUESTED'::"BookingStatus", 50, '2026-09-03 09:00:00', '2026-09-03 09:00:00');
