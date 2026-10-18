-- tc-s2-09-setup.sql: on Main Hall on 2 October, one confirmed booking and one
-- pending request at different times, plus an approved event with no booking
-- yet. The test then blocks out the whole day.
--
-- Pre-condition for TC-S2-09 (Story 16 AC-6). Load AFTER base-users.sql and
-- base-venues.sql. All times UTC.
--
--   b-s2-09-gala     Main Hall  Oct 2 09:00-12:00  APPROVED   "Gala"
--   b-s2-09-pending  Main Hall  Oct 2 13:00-15:00  REQUESTED  "Pending"
--   e-s2-09-new      APPROVED event "New one", assigned to u-coordinator-a, no booking
INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-09-gala', 'u-organiser', 'u-coordinator-a', 'Gala', 'Purpose', 'Description', 'Talk',
     '2030-10-02 09:00:00', '2030-10-02 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-09-pending', 'u-organiser', 'u-coordinator-a', 'Pending', 'Purpose', 'Description', 'Talk',
     '2030-10-02 09:00:00', '2030-10-02 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-09-new', 'u-organiser', 'u-coordinator-a', 'New one', 'Purpose', 'Description', 'Talk',
     '2030-10-02 09:00:00', '2030-10-02 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('b-s2-09-gala', 'e-s2-09-gala', 'v-main-hall', '2030-10-02 09:00:00', '2030-10-02 12:00:00',
     'APPROVED'::"BookingStatus", 80, 'u-coordinator-a', '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-09-pending', 'e-s2-09-pending', 'v-main-hall', '2030-10-02 13:00:00', '2030-10-02 15:00:00',
     'REQUESTED'::"BookingStatus", 80, 'u-coordinator-a', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
