-- tc-s3-130l-setup.sql: hall's buffers explicitly set back to 0 and 0.
--
-- Pre-condition for the click-through AC-4 (extra) test (Story 50). Load AFTER tc-s3-130g-setup.sql.
-- Times are UTC on 1 Oct 2030 unless stated.
--
--   VEN-068 setup 0, turnaround 0

UPDATE "Venue" SET "setupMinutes" = 0, "turnaroundMinutes" = 0 WHERE "id" = 'VEN-068';
