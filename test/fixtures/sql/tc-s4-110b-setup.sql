-- tc-s4-110b-setup.sql: an event still in planning using the same microphones.
--
-- Pre-condition for TC-S4-107 (only a confirmed event needs a replacement). Load AFTER tc-s4-110-setup.sql.
--
--   EVT-314 "retreat" PLANNING, Cody's, same day as the gala
--   RSV-039: 3 wireless microphones for retreat, APPROVED

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-314', 'USR-006', 'USR-004', 'retreat', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'Microphones.', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-039', 'EVT-314', 'EQP-026', 3, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'APPROVED'::"ReservationStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
