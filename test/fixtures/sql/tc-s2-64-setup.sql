-- tc-s2-64-setup.sql: bookings the no-overlap database constraint must allow.
--
-- Pre-condition for TC-S2-64 (Story 23, database backstop): loading this
-- script must succeed. Load AFTER base-users.sql and base-venues.sql.
-- All on v-main-hall, 1 Oct 2030 (UTC).
--
--   b-s2-64-morning    APPROVED  09:00-12:00
--   b-s2-64-afternoon  APPROVED  12:00-15:00  back-to-back with the morning
--   b-s2-64-pending-a  REQUESTED 10:00-11:00
--   b-s2-64-pending-b  REQUESTED 10:00-11:00  overlaps pending-a exactly

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-64-morning', 'u-organiser', 'u-coordinator-a', 'Morning', 'Purpose', 'Description', 'Talk',
     '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-64-afternoon', 'u-organiser', 'u-coordinator-a', 'Afternoon', 'Purpose', 'Description', 'Talk',
     '2030-10-01 12:00:00', '2030-10-01 15:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-64-pending-a', 'u-organiser', 'u-coordinator-a', 'Pending A', 'Purpose', 'Description', 'Talk',
     '2030-10-01 10:00:00', '2030-10-01 11:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-64-pending-b', 'u-organiser', 'u-coordinator-a', 'Pending B', 'Purpose', 'Description', 'Talk',
     '2030-10-01 10:00:00', '2030-10-01 11:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById",
  "createdAt", "updatedAt") VALUES
  ('b-s2-64-morning', 'e-s2-64-morning', 'v-main-hall', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 'APPROVED'::"BookingStatus", 80, 'u-coordinator-a',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-64-afternoon', 'e-s2-64-afternoon', 'v-main-hall', '2030-10-01 12:00:00', '2030-10-01 15:00:00', 'APPROVED'::"BookingStatus", 80, 'u-coordinator-a',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-64-pending-a', 'e-s2-64-pending-a', 'v-main-hall', '2030-10-01 10:00:00', '2030-10-01 11:00:00', 'REQUESTED'::"BookingStatus", 80, 'u-coordinator-a',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-64-pending-b', 'e-s2-64-pending-b', 'v-main-hall', '2030-10-01 10:00:00', '2030-10-01 11:00:00', 'REQUESTED'::"BookingStatus", 80, 'u-coordinator-a',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00');
