-- tc-s2-10-setup.sql: a confirmed booking on Main Hall TODAY, for the
-- browser tests of Story 16 (the calendar opens on today's week, so its data
-- must be dated relative to now; every other script uses fixed dates).
--
-- Pre-condition for TC-S2-10 and TC-S2-11 (Story 16, browser). Load AFTER
-- base-users.sql and base-venues.sql. "Today" is today in Singapore time;
-- the columns hold UTC, so each time is converted to UTC explicitly.
--
--   EVT-189  APPROVED event "Gala today" by USR-006 (Olivia Organiser), 80 expected
--   BKG-019  Main Hall     today 10:00-12:00 SGT  APPROVED
--   BLK-001  Seminar Room  today 14:00-16:00 SGT  blocked by USR-010, "Maintenance"

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-189', 'USR-006', 'USR-004', 'Gala today', 'Purpose', 'Description', 'Social',
     ((date_trunc('day', now() AT TIME ZONE 'Asia/Singapore') + interval '10 hours') AT TIME ZONE 'Asia/Singapore') AT TIME ZONE 'UTC',
     ((date_trunc('day', now() AT TIME ZONE 'Asia/Singapore') + interval '12 hours') AT TIME ZONE 'Asia/Singapore') AT TIME ZONE 'UTC',
     80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-019', 'EVT-189', 'VEN-002',
     ((date_trunc('day', now() AT TIME ZONE 'Asia/Singapore') + interval '10 hours') AT TIME ZONE 'Asia/Singapore') AT TIME ZONE 'UTC',
     ((date_trunc('day', now() AT TIME ZONE 'Asia/Singapore') + interval '12 hours') AT TIME ZONE 'Asia/Singapore') AT TIME ZONE 'UTC',
     'APPROVED'::"BookingStatus", 80, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');

INSERT INTO "VenueBlock" ("id", "venueId", "start", "end", "reason", "createdById", "createdAt") VALUES
  ('BLK-001', 'VEN-038',
     ((date_trunc('day', now() AT TIME ZONE 'Asia/Singapore') + interval '14 hours') AT TIME ZONE 'Asia/Singapore') AT TIME ZONE 'UTC',
     ((date_trunc('day', now() AT TIME ZONE 'Asia/Singapore') + interval '16 hours') AT TIME ZONE 'Asia/Singapore') AT TIME ZONE 'UTC',
     'Maintenance', 'USR-010', '2026-09-03 09:00:00');
