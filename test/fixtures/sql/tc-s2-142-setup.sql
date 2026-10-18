-- tc-s2-142-setup.sql: two more Attendees, an event that is full and one with
-- a single place left.
--
-- Pre-condition for TC-S2-142 (Story 33 AC-7). Load AFTER base-users.sql.
-- Both events: CONFIRMED, registration open (1 Jan 2026 - 28 Sep 2030),
-- 1 Oct 2030 09:00-17:00 UTC.
--
--   u-attendee-b  attendee.b@example.com  "Bea Attendee"  ATTENDEE
--   u-attendee-c  attendee.c@example.com  "Cal Attendee"  ATTENDEE
--   e-s2-full       "Sold Out Talk", capacity 2, registered: u-attendee-b, u-attendee-c
--   e-s2-last-place "Last Place Talk", capacity 2, registered: u-attendee-b

INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "createdAt", "updatedAt") VALUES
  ('u-attendee-b', 'attendee.b@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Bea Attendee', 'ATTENDEE'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('u-attendee-c', 'attendee.c@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Cal Attendee', 'ATTENDEE'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "registrationEnabled", "registrationOpensAt", "registrationClosesAt",
  "status", "createdAt", "updatedAt") VALUES
  ('e-s2-full', 'u-organiser', 'u-coordinator-a', 'Sold Out Talk', 'Purpose', 'Description', 'Social',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 2, true, '2026-01-01 00:00:00', '2030-09-28 00:00:00', 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-last-place', 'u-organiser', 'u-coordinator-a', 'Last Place Talk', 'Purpose', 'Description', 'Social',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 2, true, '2026-01-01 00:00:00', '2030-09-28 00:00:00', 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "Registration" ("id", "eventId", "attendeeId", "status", "phone", "createdAt", "updatedAt") VALUES
  ('g-s2-full-b', 'e-s2-full', 'u-attendee-b', 'REGISTERED'::"RegistrationStatus", '+65 9123 4567', '2026-09-05 09:00:00', '2026-09-05 09:00:00'),
  ('g-s2-full-c', 'e-s2-full', 'u-attendee-c', 'REGISTERED'::"RegistrationStatus", '+65 9123 4567', '2026-09-05 09:00:00', '2026-09-05 09:00:00'),
  ('g-s2-last-b', 'e-s2-last-place', 'u-attendee-b', 'REGISTERED'::"RegistrationStatus", '+65 9123 4567', '2026-09-05 09:00:00', '2026-09-05 09:00:00');
