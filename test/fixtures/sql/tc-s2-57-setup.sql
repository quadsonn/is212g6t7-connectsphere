-- tc-s2-57-setup.sql: a pending request on Main Hall with one confirmed, one
-- pending and one rejected booking around it.
--
-- Pre-condition for TC-S2-57 (Story 23 AC-2, AC-3). Load AFTER base-users.sql
-- and base-venues.sql. All on v-main-hall, 1 Oct 2030 (UTC).
--
--   b-s2-57-target       "Target"       REQUESTED 09:00-12:00  (the request being reviewed)
--   b-s2-57-confirmed    "Confirmed"    APPROVED  09:30-10:00  hard conflict
--   b-s2-57-pending      "Pending"      REQUESTED 10:30-11:00  soft conflict
--   b-s2-57-turned-down  "Turned down"  REJECTED  09:00-12:00  no conflict

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-57-target', 'u-organiser', 'u-coordinator-a', 'Target', 'Purpose', 'Description', 'Talk',
     '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-57-confirmed', 'u-organiser', 'u-coordinator-a', 'Confirmed', 'Purpose', 'Description', 'Talk',
     '2030-10-01 09:30:00', '2030-10-01 10:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-57-pending', 'u-organiser', 'u-coordinator-a', 'Pending', 'Purpose', 'Description', 'Talk',
     '2030-10-01 10:30:00', '2030-10-01 11:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-57-turned-down', 'u-organiser', 'u-coordinator-a', 'Turned down', 'Purpose', 'Description', 'Talk',
     '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById",
  "createdAt", "updatedAt") VALUES
  ('b-s2-57-target', 'e-s2-57-target', 'v-main-hall', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'u-coordinator-a',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-57-confirmed', 'e-s2-57-confirmed', 'v-main-hall', '2030-10-01 09:30:00', '2030-10-01 10:00:00', 'APPROVED'::"BookingStatus", 80, 'u-coordinator-a',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-57-pending', 'e-s2-57-pending', 'v-main-hall', '2030-10-01 10:30:00', '2030-10-01 11:00:00', 'REQUESTED'::"BookingStatus", 80, 'u-coordinator-a',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-57-turned-down', 'e-s2-57-turned-down', 'v-main-hall', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 'REJECTED'::"BookingStatus", 80, 'u-coordinator-a',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00');
