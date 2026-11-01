-- tc-s3-136-setup.sql: the customer's pair, but in the past (1 Jan 2020).
--
-- Pre-condition for TC-S3-136 (past bookings are not re-checked) (Story 51). Load AFTER tc-s3-124-setup.sql (the Sandbox Auditorium, VEN-065).
-- Each booking has its own event. Times are UTC on 1 Oct 2030 unless stated.
--
--   BKG-137 "Old A" 10:00-12:00 and BKG-138 "Old B" 12:30-14:00 on 1 Jan 2020

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-258', 'USR-006', 'USR-004', 'Old A', 'Teaching', 'A session', 'Academic', '2020-01-01 10:00:00', '2020-01-01 12:00:00', 50, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-259', 'USR-006', 'USR-004', 'Old B', 'Teaching', 'A session', 'Academic', '2020-01-01 12:30:00', '2020-01-01 14:00:00', 50, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-137', 'EVT-258', 'VEN-065', '2020-01-01 10:00:00', '2020-01-01 12:00:00', 'APPROVED'::"BookingStatus", 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-138', 'EVT-259', 'VEN-065', '2020-01-01 12:30:00', '2020-01-01 14:00:00', 'APPROVED'::"BookingStatus", 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
