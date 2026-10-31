-- tc-s3-38-setup.sql: an event in planning with Attendees, and a pending
-- request to move its date and time.
--
-- Pre-condition for TC-S3-38 (Story 38 AC-1), TC-S3-41 (AC-2), TC-S3-42
-- (AC-3), TC-S3-43 (AC-4) and TC-S3-45 (AC-6). Load AFTER base-users.sql and
-- base-venues.sql.
--
--   USR-014   ATTENDEE "Rita Registered" (rita@example.com)
--   USR-015   ATTENDEE "Walt Withdrawn" (walt@example.com)
--   EVT-191   PLANNING "Harbour Gala", organiser USR-006, Coordinator USR-004,
--             1 Oct 2030 01:00-09:00 UTC (09:00-17:00 Singapore time)
--   BKG-074   APPROVED booking of Main Hall (VEN-002) for that time
--   REG-009   USR-001 REGISTERED
--   REG-010   USR-014 REGISTERED
--   REG-011   USR-015 WITHDRAWN on 10 Sep 2026
--   CRQ-006   PENDING, from USR-006: move to 2 Oct 2030 01:00-10:00 UTC
--             (09:00-18:00 Singapore time), so the date and both times change

INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "createdAt", "updatedAt") VALUES
  ('USR-014', 'rita@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Rita Registered', 'ATTENDEE'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('USR-015', 'walt@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Walt Withdrawn', 'ATTENDEE'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "registrationEnabled", "registrationOpensAt", "registrationClosesAt",
  "status", "createdAt", "updatedAt") VALUES
  ('EVT-191', 'USR-006', 'USR-004', 'Harbour Gala', 'Purpose', 'Description', 'Social',
     '2030-10-01 01:00:00', '2030-10-01 09:00:00', 80, true, '2026-01-01 00:00:00', '2030-09-28 00:00:00',
     'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-074', 'EVT-191', 'VEN-002', '2030-10-01 01:00:00', '2030-10-01 09:00:00', 'APPROVED'::"BookingStatus", 80, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');

INSERT INTO "Registration" ("id", "eventId", "attendeeId", "status", "phone", "withdrawnAt", "createdAt", "updatedAt") VALUES
  ('REG-009', 'EVT-191', 'USR-001', 'REGISTERED'::"RegistrationStatus", '+65 9123 4567', NULL, '2026-09-05 09:00:00', '2026-09-05 09:00:00'),
  ('REG-010', 'EVT-191', 'USR-014', 'REGISTERED'::"RegistrationStatus", '+65 9123 4568', NULL, '2026-09-05 09:00:00', '2026-09-05 09:00:00'),
  ('REG-011', 'EVT-191', 'USR-015', 'WITHDRAWN'::"RegistrationStatus", '+65 9123 4569', '2026-09-10 09:00:00', '2026-09-05 09:00:00', '2026-09-10 09:00:00');

INSERT INTO "EventChangeRequest" ("id", "eventId", "requestedById", "status", "reason", "proposedStart", "proposedEnd",
  "proposedAttendance", "equipmentChanged", "decidedById", "decidedAt", "decisionReason", "createdAt", "updatedAt") VALUES
  ('CRQ-006', 'EVT-191', 'USR-006', 'PENDING'::"ChangeRequestStatus", 'The keynote speaker can only come the next day',
     '2030-10-02 01:00:00', '2030-10-02 10:00:00', NULL, false, NULL, NULL, NULL, '2026-09-11 09:00:00', '2026-09-11 09:00:00');
