-- tc-s4-102-setup.sql: a confirmed event holding a venue, equipment and one registration.
--
-- Pre-condition for every test in test/events-cancel-confirmation.e2e-spec.ts
-- (Story 65, TC-S4-102 and 103). Load AFTER base-users.sql.
--
--   VEN-086 "Main Hall", Student Centre, 200 (Vera, USR-010); EQP-024 Wireless microphone x10
--   EVT-311 "Careers Fair" CONFIRMED, Olivia's (USR-006), Cody's (USR-004), 1 Nov 2030 09:00-13:00 UTC, 150
--   BKG-168 APPROVED Main Hall; RSV-035 (2) and RSV-036 (3) microphones APPROVED
--   REG-020 Ann (USR-001) REGISTERED

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "status", "createdAt", "updatedAt") VALUES
  ('VEN-086', 'Main Hall', 'Student Centre', 200, 'USR-010', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "Equipment" ("id", "type", "totalQuantity", "createdAt", "updatedAt") VALUES
  ('EQP-024', 'Wireless microphone', 10, '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-311', 'USR-006', 'USR-004', 'Careers Fair', 'Meet employers', 'Stalls and talks', 'Careers',
     '2030-11-01 09:00:00', '2030-11-01 13:00:00', 150, 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-168', 'EVT-311', 'VEN-086', '2030-11-01 09:00:00', '2030-11-01 13:00:00', 'APPROVED'::"BookingStatus", 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-035', 'EVT-311', 'EQP-024', 2, '2030-11-01 09:00:00', '2030-11-01 13:00:00', 'APPROVED'::"ReservationStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('RSV-036', 'EVT-311', 'EQP-024', 3, '2030-11-01 09:00:00', '2030-11-01 13:00:00', 'APPROVED'::"ReservationStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');

INSERT INTO "Registration" ("id", "eventId", "attendeeId", "status", "phone", "createdAt", "updatedAt") VALUES
  ('REG-020', 'EVT-311', 'USR-001', 'REGISTERED'::"RegistrationStatus", '+6591234567', '2026-09-05 09:00:00', '2026-09-05 09:00:00');
