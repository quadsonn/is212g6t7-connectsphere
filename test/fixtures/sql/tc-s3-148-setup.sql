-- tc-s3-148-setup.sql: another event holds breakoutA in the afternoon.
--
-- Pre-condition for TC-S3-148 (Story 53 AC-3: each venue is checked on its
-- own). Load AFTER tc-s3-146-setup.sql.
--
--   EVT-275 "Other" PLANNING, Coordinator USR-005; BKG-153 APPROVED breakoutA 13:00-14:00 UTC

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-275', 'USR-006', 'USR-005', 'Other', 'p', 'd', 'c', '2030-10-01 13:00:00', '2030-10-01 14:00:00', 10, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('BKG-153', 'EVT-275', 'VEN-077', '2030-10-01 13:00:00', '2030-10-01 14:00:00', 'APPROVED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
