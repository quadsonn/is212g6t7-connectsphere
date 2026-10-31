-- tc-s3-64c-setup.sql: East Hall is booked until the moment the Showcase starts.
--
-- Pre-condition for TC-S3-64 (Story 41 AC-2: back-to-back is free). Load AFTER
-- tc-s3-63-setup.sql.
--
--   EVT-200 / BKG-086   "Morning", APPROVED eastHall 07:00-09:00 UTC

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-200', 'USR-006', 'USR-004', 'Morning', 'p', 'd', 'c', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "createdAt", "updatedAt") VALUES
  ('BKG-086', 'EVT-200', 'VEN-042', '2030-10-01 07:00:00', '2030-10-01 09:00:00', 'APPROVED'::"BookingStatus", 10, '2026-09-03 09:00:00', '2026-09-03 09:00:00');
