-- tc-s4-110c-setup.sql: a second confirmed event using the same microphones.
--
-- Pre-condition for TC-S4-110 (one alternative cannot cover two reservations). Load AFTER tc-s4-110-setup.sql.
--
--   EVT-315 "summit" CONFIRMED, Cody's, same day as the gala
--   RSV-040: 2 wireless microphones for summit, APPROVED

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-315', 'USR-006', 'USR-004', 'summit', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'Microphones.', 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-040', 'EVT-315', 'EQP-026', 2, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'APPROVED'::"ReservationStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
