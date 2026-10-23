-- tc-s2-58-setup.sql: a blocked-out period (Story 16) on Main Hall overlapping
-- the end of the tc-s2-48 request.
--
-- Pre-condition for TC-S2-58 (Story 23 AC-1, AC-2). Load AFTER base-users.sql,
-- base-venues.sql and tc-s2-48-setup.sql.
--
--   BLK-002  VEN-002, 1 Oct 2030 11:00-15:00 UTC, "Maintenance", by USR-010

INSERT INTO "VenueBlock" ("id", "venueId", "start", "end", "reason", "createdById", "createdAt") VALUES
  ('BLK-002', 'VEN-002', '2030-10-01 11:00:00', '2030-10-01 15:00:00', 'Maintenance', 'USR-010', '2026-09-03 09:00:00');
