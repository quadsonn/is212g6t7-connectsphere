-- tc-s3-59-setup.sql: a Safety Officer and an event in planning, for the
-- notifications inbox.
--
-- Pre-condition for every test in test/notifications.e2e-spec.ts: TC-S3-59
-- (Story 40 AC-3, links), TC-S3-60 (AC-4), TC-S3-61 (AC-5) and TC-S3-67
-- (Story 41 AC-5). Load AFTER base-users.sql and tc-s1-25-setup.sql (the Lead).
--
--   USR-017   SAFETY_OFFICER "Sophie Safety" (safety@example.com)
--   EVT-195   PLANNING "gala", organiser USR-006, Coordinator USR-004,
--             1 Oct 2030 01:00-05:00 UTC, 50 expected

INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "createdAt", "updatedAt") VALUES
  ('USR-017', 'safety@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Sophie Safety', 'SAFETY_OFFICER'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-195', 'USR-006', 'USR-004', 'gala', 'p', 'd', 'c',
     '2030-10-01 01:00:00', '2030-10-01 05:00:00', 50, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
