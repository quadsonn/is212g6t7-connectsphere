-- tc-s2-182-setup.sql: blocked-off periods for Story 17 (a Coordinator sees a
-- venue's blocked periods, never why or by whom).
--
-- Pre-condition for TC-S2-182 and TC-S2-183 (Story 17 AC-1, AC-3). Load AFTER
-- base-users.sql and base-venues.sql; some tests also load tc-s2-12-setup.sql
-- (a confirmed booking on Main Hall, 10 Mar 2027 09:00-17:00 SGT). Times are
-- UTC; Singapore time (SGT) is UTC+8. Every block was set by USR-010 with the
-- reason "Confidential renovation", which must never reach a Coordinator.
--
--   BLK-001  Main Hall     15 Mar 2027 09:00-13:00 SGT       one part of a day
--   BLK-002  Main Hall     20 Mar 00:00 - 23 Mar 00:00 SGT   three whole days
--   BLK-003  Main Hall     10 Mar 2027 06:00-08:00 SGT       same day as BKG-014, before it
--   BLK-004  Seminar Room  25 Mar 2027 09:00-13:00 SGT       another venue

INSERT INTO "VenueBlock" ("id", "venueId", "start", "end", "reason", "createdById", "createdAt") VALUES
  ('BLK-001', 'VEN-002', '2027-03-15 01:00:00', '2027-03-15 05:00:00', 'Confidential renovation', 'USR-010', '2026-09-03 09:00:00'),
  ('BLK-002', 'VEN-002', '2027-03-19 16:00:00', '2027-03-22 16:00:00', 'Confidential renovation', 'USR-010', '2026-09-03 09:00:00'),
  ('BLK-003', 'VEN-002', '2027-03-09 22:00:00', '2027-03-10 00:00:00', 'Confidential renovation', 'USR-010', '2026-09-03 09:00:00'),
  ('BLK-004', 'VEN-038', '2027-03-25 01:00:00', '2027-03-25 05:00:00', 'Confidential renovation', 'USR-010', '2026-09-03 09:00:00');
