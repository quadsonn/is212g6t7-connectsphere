-- tc-s3-114d-setup.sql: mainHall is blocked out on the new day.
--
-- Pre-condition for TC-S3-114 (Story 48). Load AFTER tc-s3-113-setup.sql.
-- Times are UTC; the event runs 01:00-05:00 on 1 Oct 2030 and a request moves
-- it to the same time on 2 Oct.
--
--   BLK-007 mainHall, 2 Oct 00:00-12:00, "Floor resurfacing"

INSERT INTO "VenueBlock" ("id", "venueId", "start", "end", "reason", "createdById", "createdAt") VALUES
  ('BLK-007', 'VEN-063', '2030-10-02 00:00:00', '2030-10-02 12:00:00', 'Floor resurfacing', 'USR-010', '2026-09-03 09:00:00');
