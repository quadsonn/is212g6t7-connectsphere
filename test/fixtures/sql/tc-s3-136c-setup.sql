-- tc-s3-136c-setup.sql: the customer's pair with the morning lecture only requested.
--
-- Pre-condition for TC-S3-135 and the auto-clear test (TC-S3-138) (Story 51). Load AFTER tc-s3-124-setup.sql (the Sandbox Auditorium, VEN-065).
-- Each booking has its own event. Times are UTC on 1 Oct 2030 unless stated.
--
--   BKG-140 "Morning lecture" 10:00-12:00 REQUESTED; BKG-141 "Lunch talk" 12:30-14:00 APPROVED

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-261', 'USR-006', 'USR-004', 'Morning lecture', 'Teaching', 'A session', 'Academic', '2030-10-01 10:00:00', '2030-10-01 12:00:00', 50, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-262', 'USR-006', 'USR-004', 'Lunch talk', 'Teaching', 'A session', 'Academic', '2030-10-01 12:30:00', '2030-10-01 14:00:00', 50, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-140', 'EVT-261', 'VEN-065', '2030-10-01 10:00:00', '2030-10-01 12:00:00', 'REQUESTED'::"BookingStatus", 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-141', 'EVT-262', 'VEN-065', '2030-10-01 12:30:00', '2030-10-01 14:00:00', 'APPROVED'::"BookingStatus", 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
