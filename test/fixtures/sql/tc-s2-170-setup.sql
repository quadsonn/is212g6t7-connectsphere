-- tc-s2-170-setup.sql: a second Organiser and their own submitted event.
--
-- Pre-condition for TC-S2-170 (Story 36 AC-11): Organisers can only request
-- changes to their own events. Load AFTER base-users.sql and tc-s2-159-setup.sql.
-- (u-organiser-b is the same user tc-s2-52-setup.sql adds; never load both.)
--
--   u-organiser-b  other.organiser@example.com  "Oscar Organiser"
--   e-s2-cr-oscar  SUBMITTED "Oscar's Showcase", u-organiser-b

INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "createdAt", "updatedAt") VALUES
  ('u-organiser-b', 'other.organiser@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Oscar Organiser', 'EVENT_ORGANISER'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-cr-oscar', 'u-organiser-b', 'u-coordinator-a', 'Oscar''s Showcase', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'SUBMITTED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
