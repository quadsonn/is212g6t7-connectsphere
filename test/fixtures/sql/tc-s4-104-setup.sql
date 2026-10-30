-- tc-s4-104-setup.sql: an event in planning with Wei assigned, a venue and projectors.
--
-- Pre-condition for every test in test/us66-technical-support-notifications.e2e-spec.ts
-- (Story 66, TC-S4-104 to 106). Load AFTER tc-s4-76-setup.sql (Olga, Carla,
-- and Wei and Nadia, the only two Technical Support members), INSTEAD OF
-- base-users.sql: the "pool" must be exactly those two.
--
--   USR-045  vanessa@example.com  Vanessa Venue  VENUE_STAFF
--   VEN-087 "Main Hall", Level 1, 300 (Vanessa); EQP-025 Projector x10
--   EVT-312 "Town Hall" PLANNING, Olga's, Carla's, 1 Oct 2030 10:00-12:00 UTC, 100,
--           "On-site AV technician", Wei (USR-042) assigned

INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "createdAt", "updatedAt") VALUES
  ('USR-045', 'vanessa@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Vanessa Venue', 'VENUE_STAFF'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "status", "createdAt", "updatedAt") VALUES
  ('VEN-087', 'Main Hall', 'Level 1', 300, 'USR-045', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "Equipment" ("id", "type", "totalQuantity", "createdAt", "updatedAt") VALUES
  ('EQP-025', 'Projector', 10, '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "technicalSupportNeeds", "technicalSupportId",
  "status", "createdAt", "updatedAt") VALUES
  ('EVT-312', 'USR-038', 'USR-039', 'Town Hall', 'p', 'd', 'c', '2030-10-01 10:00:00', '2030-10-01 12:00:00', 100,
     'On-site AV technician', 'USR-042', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
