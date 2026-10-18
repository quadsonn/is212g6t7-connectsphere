-- tc-s2-12-setup.sql: one confirmed booking on Main Hall in March 2027.
--
-- Pre-condition for TC-S2-12 (Story 17 AC-1). Load AFTER base-users.sql and
-- base-venues.sql. Times are UTC; 01:00-09:00 UTC is 09:00-17:00 Singapore time.
--
--   e-s2-secret        APPROVED event "Secret Board Offsite" by u-organiser
--   b-s2-12-confirmed  Main Hall  10 Mar 2027 09:00-17:00 SGT  APPROVED

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-secret', 'u-organiser', 'u-coordinator-a', 'Secret Board Offsite', 'Purpose', 'Description', 'Meeting',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 30, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('b-s2-12-confirmed', 'e-s2-secret', 'v-main-hall', '2027-03-10 01:00:00', '2027-03-10 09:00:00', 'APPROVED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
