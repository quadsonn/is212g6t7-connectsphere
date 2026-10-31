-- tc-s3-131c-setup.sql: hall is blocked out 12:00-12:30 for cleaning.
--
-- Pre-condition for TC-S3-131 (Story 50). Load AFTER tc-s3-130-setup.sql.
-- Times are UTC on 1 Oct 2030 unless stated.
--
--   BLK-008 hall 12:00-12:30, "Cleaning"

INSERT INTO "VenueBlock" ("id", "venueId", "start", "end", "reason", "createdById", "createdAt") VALUES
  ('BLK-008', 'VEN-068', '2030-10-01 12:00:00', '2030-10-01 12:30:00', 'Cleaning', 'USR-010', '2026-09-03 09:00:00');
