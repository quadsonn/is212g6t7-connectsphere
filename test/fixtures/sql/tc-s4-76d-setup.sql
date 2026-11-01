-- tc-s4-76d-setup.sql: an event that does not need technical support.
--
-- Pre-condition for TC-S4-76. Load AFTER tc-s4-76-setup.sql.
--
--   EVT-305 "Quiet Meeting" PLANNING, no technical support needs

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "technicalSupportNeeds", "technicalSupportId",
  "status", "createdAt", "updatedAt") VALUES
  ('EVT-305', 'USR-038', 'USR-039', 'Quiet Meeting', 'Share the roadmap', 'An all-hands', 'Corporate', '2030-10-01 10:00:00', '2030-10-01 12:00:00', 80,
     'A projector and two microphones', NULL, NULL, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
