-- tc-s2-142-setup.sql: two more Attendees, an event that is full and one with
-- a single place left.
--
-- Pre-condition for TC-S2-142 (Story 33 AC-7), and the base for Stories 34
-- and 35 (TC-S2-145 to TC-S2-157), which need the extra Attendees.
-- Load AFTER base-users.sql.
-- Both events: CONFIRMED, registration open (1 Jan 2026 - 28 Sep 2030),
-- 1 Oct 2030 09:00-17:00 UTC.
--
--   USR-002  attendee.b@example.com  "Bea Attendee"  ATTENDEE
--   USR-003  attendee.c@example.com  "Cal Attendee"  ATTENDEE
--   EVT-077       "Sold Out Talk", capacity 2, registered: USR-002, USR-003
--   EVT-085 "Last Place Talk", capacity 2, registered: USR-002

INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "createdAt", "updatedAt") VALUES
  ('USR-002', 'attendee.b@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Bea Attendee', 'ATTENDEE'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('USR-003', 'attendee.c@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Cal Attendee', 'ATTENDEE'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "registrationEnabled", "registrationOpensAt", "registrationClosesAt",
  "status", "createdAt", "updatedAt") VALUES
  ('EVT-077', 'USR-006', 'USR-004', 'Sold Out Talk', 'Purpose', 'Description', 'Social',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 2, true, '2026-01-01 00:00:00', '2030-09-28 00:00:00', 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-085', 'USR-006', 'USR-004', 'Last Place Talk', 'Purpose', 'Description', 'Social',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 2, true, '2026-01-01 00:00:00', '2030-09-28 00:00:00', 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "Registration" ("id", "eventId", "attendeeId", "status", "phone", "createdAt", "updatedAt") VALUES
  ('REG-003', 'EVT-077', 'USR-002', 'REGISTERED'::"RegistrationStatus", '+65 9123 4567', '2026-09-05 09:00:00', '2026-09-05 09:00:00'),
  ('REG-004', 'EVT-077', 'USR-003', 'REGISTERED'::"RegistrationStatus", '+65 9123 4567', '2026-09-05 09:00:00', '2026-09-05 09:00:00'),
  ('REG-005', 'EVT-085', 'USR-002', 'REGISTERED'::"RegistrationStatus", '+65 9123 4567', '2026-09-05 09:00:00', '2026-09-05 09:00:00');
