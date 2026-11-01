-- tc-s3-66c-setup.sql: only a pending request overlaps East Hall.
--
-- Pre-condition for TC-S3-66 (Story 41 AC-4: a pending request does not stop a
-- suggestion). Load AFTER tc-s3-63-setup.sql.
--
--   EVT-202 / BKG-088   "Other at eastHall", REQUESTED 10:00-11:00 UTC

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-202', 'USR-006', 'USR-004', 'Other at eastHall', 'p', 'd', 'c', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "createdAt", "updatedAt") VALUES
  ('BKG-088', 'EVT-202', 'VEN-042', '2030-10-01 10:00:00', '2030-10-01 11:00:00', 'REQUESTED'::"BookingStatus", 10, '2026-09-03 09:00:00', '2026-09-03 09:00:00');
