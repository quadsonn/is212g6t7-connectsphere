-- tc-s3-130g-setup.sql: hall gets 60-minute setup and turnaround (the click-through scenario).
--
-- Pre-condition for the click-through tests (Story 50). Load AFTER tc-s3-130-setup.sql.
-- Times are UTC on 1 Oct 2030 unless stated.
--
--   VEN-068 setup 60, turnaround 60

UPDATE "Venue" SET "setupMinutes" = 60, "turnaroundMinutes" = 60 WHERE "id" = 'VEN-068';
