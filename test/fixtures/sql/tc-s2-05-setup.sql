-- tc-s2-05-setup.sql: one confirmed booking on each of two of u-venue-staff's
-- venues, and one on another staff member's venue, all on the same day.
--
-- Pre-condition for TC-S2-05 (Story 16 AC-3). Load AFTER base-users.sql,
-- base-venues.sql and tc-s2-01-setup.sql. All times UTC.
--
--   b-s2-05-hall      Main Hall     Oct 2 09:00-12:00  APPROVED  "Hall event"
--   b-s2-05-room      Seminar Room  Oct 2 09:00-12:00  APPROVED  "Room event"
--   b-s2-05-not-mine  Other Hall    Oct 2 09:00-12:00  APPROVED  "Not mine"
INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-05-hall', 'u-organiser', 'u-coordinator-a', 'Hall event', 'Purpose', 'Description', 'Talk',
     '2030-10-02 09:00:00', '2030-10-02 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-05-room', 'u-organiser', 'u-coordinator-a', 'Room event', 'Purpose', 'Description', 'Talk',
     '2030-10-02 09:00:00', '2030-10-02 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-05-not-mine', 'u-organiser', 'u-coordinator-a', 'Not mine', 'Purpose', 'Description', 'Talk',
     '2030-10-02 09:00:00', '2030-10-02 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('b-s2-05-hall', 'e-s2-05-hall', 'v-main-hall', '2030-10-02 09:00:00', '2030-10-02 12:00:00',
     'APPROVED'::"BookingStatus", 80, 'u-coordinator-a', '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-05-room', 'e-s2-05-room', 'v-seminar-room', '2030-10-02 09:00:00', '2030-10-02 12:00:00',
     'APPROVED'::"BookingStatus", 80, 'u-coordinator-a', '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-05-not-mine', 'e-s2-05-not-mine', 'v-other-hall', '2030-10-02 09:00:00', '2030-10-02 12:00:00',
     'APPROVED'::"BookingStatus", 80, 'u-coordinator-a', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
