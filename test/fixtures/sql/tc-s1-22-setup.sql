-- tc-s1-22-setup.sql: a second Event Organiser, unrelated to any request.
--
-- Pre-condition for TC-S1-22 (another Organiser cannot answer a clarification
-- on a request they don't own). Load AFTER base-users.sql. Same password as the
-- base users: correct-horse-battery-staple.
--
--   u-organiser-2  other@example.com  EVENT_ORGANISER

INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "createdAt", "updatedAt") VALUES
  ('u-organiser-2', 'other@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Otto Organiser', 'EVENT_ORGANISER'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
