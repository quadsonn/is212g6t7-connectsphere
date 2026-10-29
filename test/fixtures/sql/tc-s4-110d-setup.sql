-- tc-s4-110d-setup.sql: another event holding most of the lapel microphones.
--
-- Pre-condition for TC-S4-110 (the alternative fills up before it is accepted). Load AFTER tc-s4-110-setup.sql.
--
--   EVT-316 "rival" PLANNING, Cody's, same day as the gala
--   RSV-041: 9 lapel microphones for rival, APPROVED

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-316', 'USR-006', 'USR-004', 'rival', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'Microphones.', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-041', 'EVT-316', 'EQP-027', 9, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'APPROVED'::"ReservationStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
