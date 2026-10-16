-- base-users.sql — the shared users for Sprint 1 integration tests.
--
-- Load AFTER a reset (resetDb / TRUNCATE): it inserts, it does not clear.
-- Fixed IDs, emails and timestamps so every run, and every test case's
-- pre-condition, refers to exactly the same rows. See README.md.
--
-- Password for every user: correct-horse-battery-staple
-- (bcrypt, cost 10, pre-computed — no hashing at test time).

-- One user per Sprint 1 role; two Coordinators for reassignment and
-- "assigned to someone else" cases.
INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "createdAt", "updatedAt") VALUES
  ('u-organiser',     'organiser@example.com',    '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Olivia Organiser',  'EVENT_ORGANISER'::"Role",         '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('u-coordinator-a', 'coord.a@example.com',      '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Cody Coordinator',  'EVENT_COORDINATOR'::"Role",       '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('u-coordinator-b', 'coord.b@example.com',      '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Casey Coordinator', 'EVENT_COORDINATOR'::"Role",       '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('u-venue-staff',   'venue.staff@example.com',  '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Vera Venue',        'VENUE_STAFF'::"Role",             '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('u-tech-support',  'tech.support@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Toby Tech',         'TECHNICAL_SUPPORT_STAFF'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('u-attendee',      'attendee@example.com',     '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Ann Attendee',      'ATTENDEE'::"Role",                '2026-09-01 09:00:00', '2026-09-01 09:00:00');
