-- tc-s2-103-setup.sql: equipment in every operational status, and an event to
-- hold reservations against.
--
-- Pre-condition for TC-S2-103 (Story 29 AC-1), and the base for TC-S2-104 to
-- TC-S2-112. Load AFTER base-users.sql. No reservations: the tc-s2-106 to
-- tc-s2-109 scripts add them.
--
--   EQP-004           "Wireless microphone"  24  OPERATIONAL
--   EQP-005            "Portable PA system"    6  OPERATIONAL
--   EQP-007  "Projector (4K)"        8  UNDER_MAINTENANCE
--   EQP-008          "Extension reel"       15  OUT_OF_SERVICE (damaged)
--   EVT-083  PLANNING "Industry Night", 1 Oct 2030 09:00-17:00 UTC

INSERT INTO "Equipment" ("id", "type", "description", "location", "totalQuantity", "operationalStatus", "createdAt", "updatedAt") VALUES
  ('EQP-004', 'Wireless microphone', NULL, NULL, 24, 'OPERATIONAL'::"EquipmentStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('EQP-005', 'Portable PA system', NULL, NULL, 6, 'OPERATIONAL'::"EquipmentStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('EQP-007', 'Projector (4K)', NULL, NULL, 8, 'UNDER_MAINTENANCE'::"EquipmentStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('EQP-008', 'Extension reel', NULL, NULL, 15, 'OUT_OF_SERVICE'::"EquipmentStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "registrationEnabled", "status", "createdAt", "updatedAt") VALUES
  ('EVT-083', 'USR-006', 'USR-004', 'Industry Night', 'Welcome new students', 'Full-day programme', 'Student engagement',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, NULL, false, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
