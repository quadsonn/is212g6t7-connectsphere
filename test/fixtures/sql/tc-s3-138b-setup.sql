-- tc-s3-138b-setup.sql: an afternoon seminar that also clashes with the lunch talk under 30/45.
--
-- Pre-condition for TC-S3-138 (a flag stays while another clash remains) (Story 51). Load AFTER tc-s3-135-setup.sql.
-- Each booking has its own event. Times are UTC on 1 Oct 2030 unless stated.
--
--   BKG-144 "Afternoon seminar" 14:30-16:00, APPROVED

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-265', 'USR-006', 'USR-004', 'Afternoon seminar', 'Teaching', 'A session', 'Academic', '2030-10-01 14:30:00', '2030-10-01 16:00:00', 50, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-144', 'EVT-265', 'VEN-065', '2030-10-01 14:30:00', '2030-10-01 16:00:00', 'APPROVED'::"BookingStatus", 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
