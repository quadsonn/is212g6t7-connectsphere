-- tc-s3-135-setup.sql: the customer's example: two approved bookings that clash only once 30/45 buffers apply.
--
-- Pre-condition for TC-S3-135 to 140 (Story 51). Load AFTER tc-s3-124-setup.sql (the Sandbox Auditorium, VEN-065).
-- Each booking has its own event. Times are UTC on 1 Oct 2030 unless stated.
--
--   BKG-134 "Morning lecture" 10:00-12:00 and BKG-135 "Lunch talk" 12:30-14:00, both APPROVED

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-255', 'USR-006', 'USR-004', 'Morning lecture', 'Teaching', 'A session', 'Academic', '2030-10-01 10:00:00', '2030-10-01 12:00:00', 50, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-256', 'USR-006', 'USR-004', 'Lunch talk', 'Teaching', 'A session', 'Academic', '2030-10-01 12:30:00', '2030-10-01 14:00:00', 50, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-134', 'EVT-255', 'VEN-065', '2030-10-01 10:00:00', '2030-10-01 12:00:00', 'APPROVED'::"BookingStatus", 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-135', 'EVT-256', 'VEN-065', '2030-10-01 12:30:00', '2030-10-01 14:00:00', 'APPROVED'::"BookingStatus", 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
