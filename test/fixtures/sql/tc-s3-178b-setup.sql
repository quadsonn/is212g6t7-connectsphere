-- tc-s3-178b-setup.sql: a block on Main Hall during the booked slot.
--
-- Pre-condition for TC-S3-178 (the review shows venue restrictions and
-- blocks). Load AFTER tc-s3-177e-setup.sql.
--
--   BLK-009 Main Hall, 2 Oct 2030 10:00-11:00 UTC, "Fire alarm testing", by Vera

INSERT INTO "VenueBlock" ("id", "venueId", "start", "end", "reason", "createdById", "createdAt") VALUES
  ('BLK-009', 'VEN-082', '2030-10-02 10:00:00', '2030-10-02 11:00:00', 'Fire alarm testing', 'USR-010', '2026-09-04 09:00:00');
