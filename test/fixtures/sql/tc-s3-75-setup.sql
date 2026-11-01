-- tc-s3-75-setup.sql: an event in planning with every kind of arrangement, a
-- pending change request, and one Registered and one Withdrawn Attendee.
--
-- Pre-condition for TC-S3-75 to TC-S3-82 (Story 43, cancel an event). Load
-- AFTER base-users.sql and base-venues.sql.
--
--   USR-019   ATTENDEE "Wendy Withdrawn" (wendy@example.com)
--   EVT-205   PLANNING "Autumn Festival", organiser USR-006, Coordinator USR-004,
--             5 Dec 2030 01:00-09:00 UTC, 80 expected, registration enabled
--   BKG-097   APPROVED Main Hall (VEN-002)
--   BKG-098   APPROVED Rooftop Terrace (VEN-004): a second venue
--   BKG-099   HELD Seminar Room (VEN-038), a tentative hold expiring 1 Dec 2030
--   EQP-014   PA system, 4 in stock; RSV-019 2 of them APPROVED for the event
--   CRQ-007   PENDING change request: attendance to 100
--   REG-014   USR-001 REGISTERED;  REG-015 USR-019 WITHDRAWN

INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "createdAt", "updatedAt") VALUES
  ('USR-019', 'wendy@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Wendy Withdrawn', 'ATTENDEE'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "registrationEnabled", "registrationOpensAt", "registrationClosesAt",
  "status", "createdAt", "updatedAt") VALUES
  ('EVT-205', 'USR-006', 'USR-004', 'Autumn Festival', 'Purpose', 'Description', 'Social',
     '2030-12-05 01:00:00', '2030-12-05 09:00:00', 80, true, '2026-01-01 00:00:00', '2030-12-01 00:00:00',
     'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById",
  "holdExpiresAt", "heldById", "createdAt", "updatedAt") VALUES
  ('BKG-097', 'EVT-205', 'VEN-002', '2030-12-05 01:00:00', '2030-12-05 09:00:00', 'APPROVED'::"BookingStatus", 80, 'USR-004', NULL, NULL, '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-098', 'EVT-205', 'VEN-004', '2030-12-05 01:00:00', '2030-12-05 09:00:00', 'APPROVED'::"BookingStatus", 80, 'USR-004', NULL, NULL, '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-099', 'EVT-205', 'VEN-038', '2030-12-05 01:00:00', '2030-12-05 09:00:00', 'HELD'::"BookingStatus", 30, 'USR-004', '2030-12-01 00:00:00', 'USR-010', '2026-09-03 09:00:00', '2026-09-03 09:00:00');

INSERT INTO "Equipment" ("id", "type", "totalQuantity", "createdAt", "updatedAt") VALUES
  ('EQP-014', 'PA system', 4, '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-019', 'EVT-205', 'EQP-014', 2, '2030-12-05 01:00:00', '2030-12-05 09:00:00', 'APPROVED'::"ReservationStatus", '2026-09-04 09:00:00', '2026-09-04 09:00:00');

INSERT INTO "EventChangeRequest" ("id", "eventId", "requestedById", "status", "reason", "proposedStart", "proposedEnd",
  "proposedAttendance", "equipmentChanged", "createdAt", "updatedAt") VALUES
  ('CRQ-007', 'EVT-205', 'USR-006', 'PENDING'::"ChangeRequestStatus", 'More people want to come', NULL, NULL, 100, false, '2026-09-11 09:00:00', '2026-09-11 09:00:00');

INSERT INTO "Registration" ("id", "eventId", "attendeeId", "status", "phone", "withdrawnAt", "createdAt", "updatedAt") VALUES
  ('REG-014', 'EVT-205', 'USR-001', 'REGISTERED'::"RegistrationStatus", '+65 9123 4567', NULL, '2026-09-05 09:00:00', '2026-09-05 09:00:00'),
  ('REG-015', 'EVT-205', 'USR-019', 'WITHDRAWN'::"RegistrationStatus", '+65 9123 4570', '2026-09-10 09:00:00', '2026-09-05 09:00:00', '2026-09-10 09:00:00');
