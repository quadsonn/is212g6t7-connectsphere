-- tc-s2-15-setup.sql: on Main Hall in March 2027, a pending request on the
-- 12th and a rejected request on the 14th, and nothing confirmed.
--
-- Pre-condition for TC-S2-15 (Story 17 AC-4). Load AFTER base-users.sql and
-- base-venues.sql. Times UTC (09:00-17:00 Singapore time).
--
--   b-s2-15-pending   Main Hall  12 Mar 2027  REQUESTED
--   b-s2-15-rejected  Main Hall  14 Mar 2027  REJECTED

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-secret', 'u-organiser', 'u-coordinator-a', 'Secret Board Offsite', 'Purpose', 'Description', 'Meeting',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 30, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('b-s2-15-pending', 'e-s2-secret', 'v-main-hall', '2027-03-12 01:00:00', '2027-03-12 09:00:00', 'REQUESTED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-15-rejected', 'e-s2-secret', 'v-main-hall', '2027-03-14 01:00:00', '2027-03-14 09:00:00', 'REJECTED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
