-- tc-s4-76-setup.sql: the people of the Technical Support assignment workflow.
--
-- Pre-condition for every test in test/us61-technical-support-assignment.e2e-spec.ts
-- (Story 61, TC-S4-76 to 79). Load INSTEAD OF base-users.sql: the tests need
-- exactly two Technical Support members. Same password as the base users.
--
--   USR-038  olga.organiser@example.com  Olga Organiser     EVENT_ORGANISER
--   USR-039  carla@example.com           Carla Coordinator  EVENT_COORDINATOR
--   USR-040  coordinator2@example.com    Colin Coordinator  EVENT_COORDINATOR
--   USR-041  lena.lead@example.com       Lena Lead          EVENT_COORDINATOR_LEAD
--   USR-042  wei.t@example.com           Wei Technical      TECHNICAL_SUPPORT_STAFF
--   USR-043  nadia.t@example.com         Nadia Technical    TECHNICAL_SUPPORT_STAFF

INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "createdAt", "updatedAt") VALUES
  ('USR-038', 'olga.organiser@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Olga Organiser',    'EVENT_ORGANISER'::"Role",         '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('USR-039', 'carla@example.com',          '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Carla Coordinator', 'EVENT_COORDINATOR'::"Role",       '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('USR-040', 'coordinator2@example.com',   '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Colin Coordinator', 'EVENT_COORDINATOR'::"Role",       '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('USR-041', 'lena.lead@example.com',      '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Lena Lead',         'EVENT_COORDINATOR_LEAD'::"Role",  '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('USR-042', 'wei.t@example.com',          '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Wei Technical',     'TECHNICAL_SUPPORT_STAFF'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('USR-043', 'nadia.t@example.com',        '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Nadia Technical',   'TECHNICAL_SUPPORT_STAFF'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
