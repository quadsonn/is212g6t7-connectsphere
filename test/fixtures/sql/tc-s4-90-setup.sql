-- tc-s4-90-setup.sql: a second Coordinator Lead.
--
-- Pre-condition for every test in test/event-submitted-notification.e2e-spec.ts
-- (Story 63, TC-S4-90 to 95). Load AFTER base-users.sql and tc-s1-25-setup.sql
-- (Leah Lead, USR-012), so every Lead can be shown to be notified, not just one.
-- Same password as the base users.
--
--   USR-044  lead2@example.com  Lars Lead  EVENT_COORDINATOR_LEAD

INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "createdAt", "updatedAt") VALUES
  ('USR-044', 'lead2@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Lars Lead', 'EVENT_COORDINATOR_LEAD'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
