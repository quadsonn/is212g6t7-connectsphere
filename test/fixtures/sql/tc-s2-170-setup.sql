-- tc-s2-170-setup.sql: a second Organiser and their own submitted event.
--
-- Pre-condition for TC-S2-170 (Story 36 AC-11): Organisers can only request
-- changes to their own events. Load AFTER base-users.sql and tc-s2-159-setup.sql.
-- (USR-008 is the same user tc-s2-52-setup.sql adds; never load both.)
--
--   USR-008  other.organiser@example.com  "Oscar Organiser"
--   EVT-070  SUBMITTED "Oscar's Showcase", USR-008

INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "createdAt", "updatedAt") VALUES
  ('USR-008', 'other.organiser@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Oscar Organiser', 'EVENT_ORGANISER'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-070', 'USR-008', 'USR-004', 'Oscar''s Showcase', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'SUBMITTED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
