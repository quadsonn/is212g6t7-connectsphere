-- tc-s2-52-setup.sql: a second Event Organiser, unrelated to any Sprint 2 event.
--
-- Pre-condition for TC-S2-52 (Story 22 AC-5): proves a booking decision is
-- visible to the event's own Organiser only. Load AFTER base-users.sql.
--
--   u-organiser-b  other.organiser@example.com  "Oscar Organiser"  EVENT_ORGANISER

INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "createdAt", "updatedAt") VALUES
  ('u-organiser-b', 'other.organiser@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Oscar Organiser', 'EVENT_ORGANISER'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
