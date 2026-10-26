-- tc-s3-66b-setup.sql: East Hall is blocked out over part of the Showcase's slot.
--
-- Pre-condition for TC-S3-66 (Story 41 AC-4). Load AFTER tc-s3-63-setup.sql.
--
--   BLK-006   eastHall 08:00-10:00 UTC, "Deep clean", by USR-018

INSERT INTO "VenueBlock" ("id", "venueId", "start", "end", "reason", "createdById", "createdAt") VALUES
  ('BLK-006', 'VEN-042', '2030-10-01 08:00:00', '2030-10-01 10:00:00', 'Deep clean', 'USR-018', '2026-09-03 09:00:00');
