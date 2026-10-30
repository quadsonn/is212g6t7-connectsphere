-- tc-s3-126-setup.sql: the Sandbox Auditorium already has 10-minute buffers.
--
-- Pre-condition for TC-S3-126 (Story 49 AC-3: a refused value saves nothing).
-- Load AFTER tc-s3-124-setup.sql.
--
--   VEN-065   setup 10, turnaround 10

UPDATE "Venue" SET "setupMinutes" = 10, "turnaroundMinutes" = 10 WHERE "id" = 'VEN-065';
