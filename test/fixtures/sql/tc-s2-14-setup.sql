-- tc-s2-14-setup.sql: on Main Hall in March 2027, a confirmed booking on the
-- 10th and a pending request on the 12th, both for an event whose name and
-- organiser the Coordinator's calendar must never reveal.
--
-- Pre-condition for TC-S2-14 (Story 17 AC-3). Load AFTER base-users.sql and
-- base-venues.sql. Times UTC (09:00-17:00 Singapore time).
--
--   e-s2-secret        APPROVED event "Secret Board Offsite" by u-organiser (Olivia Organiser)
--   b-s2-14-confirmed  Main Hall  10 Mar 2027  APPROVED
--   b-s2-14-pending    Main Hall  12 Mar 2027  REQUESTED

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-secret', 'u-organiser', 'u-coordinator-a', 'Secret Board Offsite', 'Purpose', 'Description', 'Meeting',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 30, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('b-s2-14-confirmed', 'e-s2-secret', 'v-main-hall', '2027-03-10 01:00:00', '2027-03-10 09:00:00', 'APPROVED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-14-pending', 'e-s2-secret', 'v-main-hall', '2027-03-12 01:00:00', '2027-03-12 09:00:00', 'REQUESTED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
