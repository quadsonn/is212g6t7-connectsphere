-- tc-s2-103-setup.sql: equipment in every operational status, and an event to
-- hold reservations against.
--
-- Pre-condition for TC-S2-103 (Story 29 AC-1), and the base for TC-S2-104 to
-- TC-S2-112. Load AFTER base-users.sql. No reservations: the tc-s2-106 to
-- tc-s2-109 scripts add them.
--
--   q-s2-mic           "Wireless microphone"  24  OPERATIONAL
--   q-s2-pa            "Portable PA system"    6  OPERATIONAL
--   q-s2-projector-4k  "Projector (4K)"        8  UNDER_MAINTENANCE
--   q-s2-reel          "Extension reel"       15  OUT_OF_SERVICE (damaged)
--   e-s2-industry-night  PLANNING "Industry Night", 1 Oct 2030 09:00-17:00 UTC

INSERT INTO "Equipment" ("id", "type", "description", "location", "totalQuantity", "operationalStatus", "createdAt", "updatedAt") VALUES
  ('q-s2-mic', 'Wireless microphone', NULL, NULL, 24, 'OPERATIONAL'::"EquipmentStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('q-s2-pa', 'Portable PA system', NULL, NULL, 6, 'OPERATIONAL'::"EquipmentStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('q-s2-projector-4k', 'Projector (4K)', NULL, NULL, 8, 'UNDER_MAINTENANCE'::"EquipmentStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('q-s2-reel', 'Extension reel', NULL, NULL, 15, 'OUT_OF_SERVICE'::"EquipmentStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "registrationEnabled", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-industry-night', 'u-organiser', 'u-coordinator-a', 'Industry Night', 'Welcome new students', 'Full-day programme', 'Student engagement',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, NULL, false, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
