-- tc-s3-88-setup.sql: a catalogue item and an event in planning that could use it.
--
-- Pre-condition for every test in test/equipment-status.e2e-spec.ts (TC-S3-88 to 94) (Story 45). Load AFTER base-users.sql.
--
--   EQP-016   Wireless microphone, 10 in stock, AV Store, Available
--   EVT-213   PLANNING "Conference", USR-006 / USR-004, 1 Oct 2030 09:00-17:00 UTC

INSERT INTO "Equipment" ("id", "type", "location", "totalQuantity", "operationalStatus", "createdAt", "updatedAt") VALUES
  ('EQP-016', 'Wireless microphone', 'AV Store', 10, 'OPERATIONAL'::"EquipmentStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-213', 'USR-006', 'USR-004', 'Conference', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'Microphones.', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
