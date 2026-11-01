-- tc-s4-73-setup.sql: three Technical Support colleagues and one item.
--
-- Pre-condition for every test in test/us60-equipment-status-alerts.e2e-spec.ts
-- (Story 60, TC-S4-73 to 75). Load AFTER base-users.sql (which adds Toby Tech,
-- USR-009, a fourth Technical Support member). Same password as the base users.
--
--   USR-035  wei@example.com    Wei Technical    TECHNICAL_SUPPORT_STAFF
--   USR-036  nadia@example.com  Nadia Technical  TECHNICAL_SUPPORT_STAFF
--   USR-037  omar@example.com   Omar Technical   TECHNICAL_SUPPORT_STAFF
--   EQP-023  Projector x4, operational

INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "createdAt", "updatedAt") VALUES
  ('USR-035', 'wei@example.com',   '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Wei Technical',   'TECHNICAL_SUPPORT_STAFF'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('USR-036', 'nadia@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Nadia Technical', 'TECHNICAL_SUPPORT_STAFF'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('USR-037', 'omar@example.com',  '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Omar Technical',  'TECHNICAL_SUPPORT_STAFF'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "Equipment" ("id", "type", "totalQuantity", "createdAt", "updatedAt") VALUES
  ('EQP-023', 'Projector', 4, '2026-09-01 09:00:00', '2026-09-01 09:00:00');
