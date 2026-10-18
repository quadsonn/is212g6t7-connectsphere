-- tc-s2-07-setup.sql: one pending booking request on Main Hall, to be
-- approved, reversed or rejected through the API during the test.
--
-- Pre-condition for TC-S2-07 (Story 16 AC-5). Load AFTER base-users.sql and
-- base-venues.sql. All times UTC.
--
--   b-s2-07-talk  Main Hall  Oct 2 09:00-12:00  REQUESTED  "Talk"
INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-07-talk', 'u-organiser', 'u-coordinator-a', 'Talk', 'Purpose', 'Description', 'Talk',
     '2030-10-02 09:00:00', '2030-10-02 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('b-s2-07-talk', 'e-s2-07-talk', 'v-main-hall', '2030-10-02 09:00:00', '2030-10-02 12:00:00',
     'REQUESTED'::"BookingStatus", 80, 'u-coordinator-a', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
