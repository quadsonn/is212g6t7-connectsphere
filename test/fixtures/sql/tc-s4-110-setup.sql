-- tc-s4-110-setup.sql: two kinds of microphone, and a confirmed event using one.
--
-- Pre-condition for every test in test/equipment-substitutions.e2e-spec.ts (Story 67, TC-S4-107 to 110). Load AFTER base-users.sql (Toby of Technical Support, Cody and Casey the Coordinators, Olivia the Organiser).
--
--   EQP-026 "Wireless microphone" x10 and EQP-027 "Lapel microphone" x10, AV Store
--   EVT-313 "gala" CONFIRMED, Olivia's, Cody's, 1 Oct 2030 09:00-17:00 UTC
--   RSV-038 (galaMic): 2 wireless microphones for the gala, APPROVED

INSERT INTO "Equipment" ("id", "type", "totalQuantity", "location", "createdAt", "updatedAt") VALUES
  ('EQP-026', 'Wireless microphone', 10, 'AV Store', '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('EQP-027', 'Lapel microphone', 10, 'AV Store', '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-313', 'USR-006', 'USR-004', 'gala', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'Microphones.', 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-038', 'EVT-313', 'EQP-026', 2, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'APPROVED'::"ReservationStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
