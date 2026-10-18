-- tc-s2-04-setup.sql: two confirmed bookings on Main Hall, two and a half
-- weeks apart, so each calendar window can be shown to include or exclude them.
--
-- Pre-condition for TC-S2-04 (Story 16 AC-2). Load AFTER base-users.sql and
-- base-venues.sql. All times UTC.
--
--   b-s2-04-day-two    Main Hall  Oct 2  09:00-12:00  APPROVED  "Day two"
--   b-s2-04-next-week  Main Hall  Oct 20 09:00-12:00  APPROVED  "Next week"
INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-04-day-two', 'u-organiser', 'u-coordinator-a', 'Day two', 'Purpose', 'Description', 'Talk',
     '2030-10-02 09:00:00', '2030-10-02 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-04-next-week', 'u-organiser', 'u-coordinator-a', 'Next week', 'Purpose', 'Description', 'Talk',
     '2030-10-20 09:00:00', '2030-10-20 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('b-s2-04-day-two', 'e-s2-04-day-two', 'v-main-hall', '2030-10-02 09:00:00', '2030-10-02 12:00:00',
     'APPROVED'::"BookingStatus", 80, 'u-coordinator-a', '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-04-next-week', 'e-s2-04-next-week', 'v-main-hall', '2030-10-20 09:00:00', '2030-10-20 12:00:00',
     'APPROVED'::"BookingStatus", 80, 'u-coordinator-a', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
