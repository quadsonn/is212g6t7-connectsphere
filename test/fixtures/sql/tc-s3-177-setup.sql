-- tc-s3-177-setup.sql: two Safety Officers, a venue with restrictions, microphones, and an event in planning.
--
-- Pre-condition for every test in test/safety-check.e2e-spec.ts (Story 57,
-- TC-S3-177 to 186). Load AFTER base-users.sql. Same password as the base
-- users: correct-horse-battery-staple. No other script with a Safety Officer
-- (such as tc-s3-59-setup.sql) may be loaded with it.
--
--   USR-033  sam.officer@example.com  Sam  SAFETY_OFFICER
--   USR-034  mei.officer@example.com  Mei  SAFETY_OFFICER
--   VEN-082 Main Hall, Student Centre, 200 (Vera, USR-010), "No open flames. ..."
--   EQP-022 Wireless microphone x10
--   EVT-300 "Careers Fair" PLANNING, USR-006 / USR-004, 1 Oct 2030 09:00-13:00 UTC, 150, theatre, step-free

INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "createdAt", "updatedAt") VALUES
  ('USR-033', 'sam.officer@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Sam', 'SAFETY_OFFICER'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('USR-034', 'mei.officer@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Mei', 'SAFETY_OFFICER'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "Venue" ("id", "name", "location", "capacity", "operatingInfo", "managedById", "status", "createdAt", "updatedAt") VALUES
  ('VEN-082', 'Main Hall', 'Student Centre', 200, 'No open flames. Maximum two doors in use after 22:00.', 'USR-010', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "Equipment" ("id", "type", "totalQuantity", "createdAt", "updatedAt") VALUES
  ('EQP-022', 'Wireless microphone', 10, '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "preferredLayout", "accessibilityRequirements", "status", "createdAt", "updatedAt") VALUES
  ('EVT-300', 'USR-006', 'USR-004', 'Careers Fair', 'Meet employers', 'Stalls and talks', 'Careers', '2030-10-01 09:00:00', '2030-10-01 13:00:00', 150,
     'THEATRE'::"RoomLayout", ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
