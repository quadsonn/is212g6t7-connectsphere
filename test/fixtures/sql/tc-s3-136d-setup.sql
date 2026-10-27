-- tc-s3-136d-setup.sql: the customer's pair, on a different venue.
--
-- Pre-condition for TC-S3-135 (other venues untouched) (Story 51). Load AFTER tc-s3-124-setup.sql (the Sandbox Auditorium, VEN-065).
-- Each booking has its own event. Times are UTC on 1 Oct 2030 unless stated.
--
--   VEN-072 "Other Hall" (Vera's); BKG-142 "Morning lecture" and BKG-143 "Lunch talk" on it

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "status", "createdAt", "updatedAt") VALUES
  ('VEN-072', 'Other Hall', 'School of Computing, Level 1', 420, 'USR-010', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-263', 'USR-006', 'USR-004', 'Morning lecture', 'Teaching', 'A session', 'Academic', '2030-10-01 10:00:00', '2030-10-01 12:00:00', 50, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-264', 'USR-006', 'USR-004', 'Lunch talk', 'Teaching', 'A session', 'Academic', '2030-10-01 12:30:00', '2030-10-01 14:00:00', 50, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-142', 'EVT-263', 'VEN-072', '2030-10-01 10:00:00', '2030-10-01 12:00:00', 'APPROVED'::"BookingStatus", 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-143', 'EVT-264', 'VEN-072', '2030-10-01 12:30:00', '2030-10-01 14:00:00', 'APPROVED'::"BookingStatus", 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
