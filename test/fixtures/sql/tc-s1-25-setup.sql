-- tc-s1-25-setup.sql: the Event Coordinator Lead, who owns the unassigned queue.
--
-- Pre-condition for TC-S1-25 (US-03 AC-2: a new submission becomes visible for
-- review, which since Week 7 Change 5 means the Lead's unassigned queue, not
-- every Coordinator). Load AFTER base-users.sql. Same password as the base
-- users: correct-horse-battery-staple.
--
--   USR-012  lead@example.com  EVENT_COORDINATOR_LEAD

INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "createdAt", "updatedAt") VALUES
  ('USR-012', 'lead@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Leah Lead', 'EVENT_COORDINATOR_LEAD'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
