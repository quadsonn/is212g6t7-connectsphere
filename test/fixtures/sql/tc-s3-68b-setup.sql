-- tc-s3-68b-setup.sql: East Hall's capacity is cut below the Showcase's 80.
--
-- Pre-condition for the capacity test "refuses accepting a suggestion whose
-- venue no longer holds the attendance" (TC-S3-68), loaded after the
-- rejection. Load AFTER tc-s3-63-setup.sql.
--
--   VEN-042   eastHall capacity 100 -> 50

UPDATE "Venue" SET "capacity" = 50 WHERE "id" = 'VEN-042';
