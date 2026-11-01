-- tc-s3-71e-setup.sql: another event's free-text line.
--
-- Pre-condition for TC-S3-71 (a line from another event) (Story 42). Load AFTER tc-s3-70-setup.sql.
--
--   EVT-204   PLANNING "Graduation showcase" (a second one), same people and time
--   REQ-013   1 x "Stage lighting rig" on EVT-204

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-204', 'USR-006', 'USR-004', 'Graduation showcase', 'Celebration', 'Final-year projects on show', 'Academic',
     '2030-11-01 10:00:00', '2030-11-01 14:00:00', 120, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "EquipmentRequirement" ("id", "eventId", "equipmentId", "equipmentType", "quantity", "createdAt", "updatedAt") VALUES
  ('REQ-013', 'EVT-204', NULL, 'Stage lighting rig', 1, '2026-09-03 09:00:00', '2026-09-03 09:00:00');
