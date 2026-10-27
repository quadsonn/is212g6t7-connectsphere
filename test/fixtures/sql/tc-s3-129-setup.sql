-- tc-s3-129-setup.sql: a booking stored with an already-padded window, to check
-- the shared overlap rule.
--
-- Pre-condition for TC-S3-129 (Story 49 AC-6). Load AFTER tc-s3-124-setup.sql.
--
--   EVT-252   APPROVED "Seminar", organiser USR-006
--   BKG-119   APPROVED Sandbox Auditorium, 1 Oct 2030 09:30-12:45 UTC
--             (10:00-12:00 padded by 30 minutes before and 45 after)

INSERT INTO "EventRequest" ("id", "organiserId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-252', 'USR-006', 'Seminar', 'Teaching', 'A seminar', 'Academic', '2030-10-01 09:30:00', '2030-10-01 12:45:00', 50,
     'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('BKG-119', 'EVT-252', 'VEN-065', '2030-10-01 09:30:00', '2030-10-01 12:45:00', 'APPROVED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
