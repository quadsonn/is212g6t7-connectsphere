-- tc-s3-159-setup.sql: the people of the Coordinator Lead workflow.
--
-- Pre-condition for every test in test/events-assignment.e2e-spec.ts (Stories
-- 55 and 56, TC-S3-159 to 176). Load INSTEAD OF base-users.sql: the tests
-- need exactly two Event Coordinators. Same password as the base users:
-- correct-horse-battery-staple.
--
--   USR-028  olive@example.com   Olive   EVENT_ORGANISER (Acme Corp)
--   USR-029  lena@example.com    Lena    EVENT_COORDINATOR_LEAD
--   USR-030  marcus@example.com  Marcus  EVENT_COORDINATOR
--   USR-031  fatima@example.com  Fatima  EVENT_COORDINATOR
--   USR-032  venue@example.com   Vic     VENUE_STAFF

INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "organisation", "createdAt", "updatedAt") VALUES
  ('USR-028', 'olive@example.com',  '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Olive',  'EVENT_ORGANISER'::"Role",        'Acme Corp', '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('USR-029', 'lena@example.com',   '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Lena',   'EVENT_COORDINATOR_LEAD'::"Role", NULL,        '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('USR-030', 'marcus@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Marcus', 'EVENT_COORDINATOR'::"Role",      NULL,        '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('USR-031', 'fatima@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Fatima', 'EVENT_COORDINATOR'::"Role",      NULL,        '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('USR-032', 'venue@example.com',  '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Vic',    'VENUE_STAFF'::"Role",            NULL,        '2026-09-01 09:00:00', '2026-09-01 09:00:00');
