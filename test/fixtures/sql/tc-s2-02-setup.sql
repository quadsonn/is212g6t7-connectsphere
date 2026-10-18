-- tc-s2-02-setup.sql: one booking of each status on Main Hall, one booking on
-- another staff member's venue, and one blocked period on Seminar Room.
--
-- Pre-condition for TC-S2-02 (Story 16 AC-1). Load AFTER base-users.sql,
-- base-venues.sql and tc-s2-01-setup.sql. All times UTC, October 2030.
--
--   b-s2-02-pending    Main Hall    Oct 2 09:00-12:00  REQUESTED  "Pending talk"
--   b-s2-02-confirmed  Main Hall    Oct 3 09:00-12:00  APPROVED   "Confirmed gala"
--   b-s2-02-rejected   Main Hall    Oct 4 09:00-12:00  REJECTED   "Rejected one"
--   b-s2-02-not-mine   Other Hall   Oct 2 09:00-12:00  APPROVED   "Not mine"
--   k-s2-02-holiday    Seminar Room Oct 5 00:00 - Oct 6 00:00, blocked "Holiday"
INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-02-pending', 'u-organiser', 'u-coordinator-a', 'Pending talk', 'Purpose', 'Description', 'Talk',
     '2030-10-02 09:00:00', '2030-10-02 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-02-confirmed', 'u-organiser', 'u-coordinator-a', 'Confirmed gala', 'Purpose', 'Description', 'Talk',
     '2030-10-03 09:00:00', '2030-10-03 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-02-rejected', 'u-organiser', 'u-coordinator-a', 'Rejected one', 'Purpose', 'Description', 'Talk',
     '2030-10-04 09:00:00', '2030-10-04 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-02-not-mine', 'u-organiser', 'u-coordinator-a', 'Not mine', 'Purpose', 'Description', 'Talk',
     '2030-10-02 09:00:00', '2030-10-02 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('b-s2-02-pending', 'e-s2-02-pending', 'v-main-hall', '2030-10-02 09:00:00', '2030-10-02 12:00:00',
     'REQUESTED'::"BookingStatus", 80, 'u-coordinator-a', '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-02-confirmed', 'e-s2-02-confirmed', 'v-main-hall', '2030-10-03 09:00:00', '2030-10-03 12:00:00',
     'APPROVED'::"BookingStatus", 80, 'u-coordinator-a', '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-02-rejected', 'e-s2-02-rejected', 'v-main-hall', '2030-10-04 09:00:00', '2030-10-04 12:00:00',
     'REJECTED'::"BookingStatus", 80, 'u-coordinator-a', '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-02-not-mine', 'e-s2-02-not-mine', 'v-other-hall', '2030-10-02 09:00:00', '2030-10-02 12:00:00',
     'APPROVED'::"BookingStatus", 80, 'u-coordinator-a', '2026-09-03 09:00:00', '2026-09-03 09:00:00');

INSERT INTO "VenueBlock" ("id", "venueId", "start", "end", "reason", "createdById", "createdAt") VALUES
  ('k-s2-02-holiday', 'v-seminar-room', '2030-10-05 00:00:00', '2030-10-06 00:00:00', 'Holiday', 'u-venue-staff', '2026-09-03 09:00:00');
