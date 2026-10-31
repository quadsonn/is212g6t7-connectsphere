-- tc-s3-99-setup.sql: eight Attendees to register and race for places.
--
-- Pre-condition for every test in test/registrations-period-capacity.e2e-spec.ts (TC-S3-99 to 106) (Story 46). Load AFTER base-users.sql.
-- The test freezes "now" at 1 Mar 2030 00:00 UTC; every date below is fixed
-- relative to it. Unless stated, an event is CONFIRMED, registration enabled,
-- 50 places, 31 Mar 2030 00:00-04:00 UTC, with the default window (opens 2
-- months before, closes 3 days before the start).
--
--   USR-020 to USR-027   ATTENDEE "a1" to "a8" (a1@example.com to a8@example.com)

INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "createdAt", "updatedAt") VALUES
  ('USR-020', 'a1@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'a1', 'ATTENDEE'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('USR-021', 'a2@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'a2', 'ATTENDEE'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('USR-022', 'a3@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'a3', 'ATTENDEE'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('USR-023', 'a4@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'a4', 'ATTENDEE'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('USR-024', 'a5@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'a5', 'ATTENDEE'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('USR-025', 'a6@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'a6', 'ATTENDEE'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('USR-026', 'a7@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'a7', 'ATTENDEE'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('USR-027', 'a8@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'a8', 'ATTENDEE'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
