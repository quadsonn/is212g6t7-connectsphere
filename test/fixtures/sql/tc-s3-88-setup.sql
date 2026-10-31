-- tc-s3-88-setup.sql: the Story 45 team. Same password as the base users.
--
-- Pre-condition for every test in test/equipment-status.e2e-spec.ts and
-- test/equipment-shortage.e2e-spec.ts (Story 45, TC-S3-88 to 98; Story 60
-- TC-S4-73/74; Story 67 TC-S4-107, 110). Loaded on its own (not with
-- base-users.sql). Each user's name is their key in the tests: messages read
-- "marked Damaged by tech".
--
--   USR-046  tech@example.com          tech              TECHNICAL_SUPPORT_STAFF
--   USR-047  tech2@example.com         tech2             TECHNICAL_SUPPORT_STAFF
--   USR-048  coordinator@example.com   coordinator       EVENT_COORDINATOR
--   USR-049  coordinator2@example.com  coordinator2      EVENT_COORDINATOR
--   USR-050  other@example.com         otherCoordinator  EVENT_COORDINATOR
--   USR-051  organiser@example.com     organiser         EVENT_ORGANISER

INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "createdAt", "updatedAt") VALUES
  ('USR-046', 'tech@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'tech', 'TECHNICAL_SUPPORT_STAFF'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('USR-047', 'tech2@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'tech2', 'TECHNICAL_SUPPORT_STAFF'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('USR-048', 'coordinator@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'coordinator', 'EVENT_COORDINATOR'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('USR-049', 'coordinator2@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'coordinator2', 'EVENT_COORDINATOR'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('USR-050', 'other@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'otherCoordinator', 'EVENT_COORDINATOR'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('USR-051', 'organiser@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'organiser', 'EVENT_ORGANISER'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
