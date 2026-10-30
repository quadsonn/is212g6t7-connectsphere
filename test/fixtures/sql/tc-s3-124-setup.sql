-- tc-s3-124-setup.sql: a published venue saved without any buffer values.
--
-- Pre-condition for every test in test/venue-buffers.e2e-spec.ts (Story 49,
-- TC-S3-124 to 129). Load AFTER base-users.sql and tc-s1-96-setup.sql (Vince,
-- a second Venue Staff member who manages no venue).
--
--   VEN-065   "Sandbox Auditorium", School of Computing, Level 1, 420, PUBLISHED,
--             managed by USR-010; setup and turnaround left to their defaults

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "status", "createdAt", "updatedAt") VALUES
  ('VEN-065', 'Sandbox Auditorium', 'School of Computing, Level 1', 420, 'USR-010', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
