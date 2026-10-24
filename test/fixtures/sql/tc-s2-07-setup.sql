-- tc-s2-07-setup.sql: one pending booking request on Main Hall, to be
-- approved, reversed or rejected through the API during the test.
--
-- Pre-condition for TC-S2-07 (Story 16 AC-5). Load AFTER base-users.sql and
-- base-venues.sql. All times UTC.
--
--   BKG-011  Main Hall  Oct 2 09:00-12:00  REQUESTED  "Talk"
INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-023', 'USR-006', 'USR-004', 'Talk', 'Purpose', 'Description', 'Talk',
     '2030-10-02 09:00:00', '2030-10-02 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-011', 'EVT-023', 'VEN-002', '2030-10-02 09:00:00', '2030-10-02 12:00:00',
     'REQUESTED'::"BookingStatus", 80, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
