-- tc-s3-66-setup.sql: another event has East Hall APPROVED over the Showcase's slot.
--
-- Pre-condition for TC-S3-66 (Story 41 AC-4) and TC-S3-68 (AC-6: booked
-- meanwhile, loaded after the rejection). Load AFTER tc-s3-63-setup.sql.
--
--   EVT-201 / BKG-087   "Other at eastHall", APPROVED 10:00-11:00 UTC

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-201', 'USR-006', 'USR-004', 'Other at eastHall', 'p', 'd', 'c', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "createdAt", "updatedAt") VALUES
  ('BKG-087', 'EVT-201', 'VEN-042', '2030-10-01 10:00:00', '2030-10-01 11:00:00', 'APPROVED'::"BookingStatus", 10, '2026-09-03 09:00:00', '2026-09-03 09:00:00');
