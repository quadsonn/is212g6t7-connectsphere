-- tc-s3-136b-setup.sql: the morning lecture, and a rejected talk at lunchtime.
--
-- Pre-condition for TC-S3-135 (Story 51). Load AFTER tc-s3-124-setup.sql (the Sandbox Auditorium, VEN-065).
-- Each booking has its own event. Times are UTC on 1 Oct 2030 unless stated.
--
--   BKG-134 "Morning lecture" APPROVED; BKG-139 "Rejected talk" 12:30-14:00 REJECTED

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-255', 'USR-006', 'USR-004', 'Morning lecture', 'Teaching', 'A session', 'Academic', '2030-10-01 10:00:00', '2030-10-01 12:00:00', 50, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-260', 'USR-006', 'USR-004', 'Rejected talk', 'Teaching', 'A session', 'Academic', '2030-10-01 12:30:00', '2030-10-01 14:00:00', 50, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-134', 'EVT-255', 'VEN-065', '2030-10-01 10:00:00', '2030-10-01 12:00:00', 'APPROVED'::"BookingStatus", 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-139', 'EVT-260', 'VEN-065', '2030-10-01 12:30:00', '2030-10-01 14:00:00', 'REJECTED'::"BookingStatus", 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
