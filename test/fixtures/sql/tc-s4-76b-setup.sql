-- tc-s4-76b-setup.sql: an event in planning that needs on-site technical support.
--
-- Pre-condition for most tests of Story 61. Load AFTER tc-s4-76-setup.sql.
--
--   EVT-304 "Town Hall" PLANNING, Carla's, 1 Oct 2030 10:00-12:00 UTC, 80 people,
--           "On-site AV technician for the keynote", nobody assigned

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "technicalSupportNeeds", "technicalSupportId",
  "status", "createdAt", "updatedAt") VALUES
  ('EVT-304', 'USR-038', 'USR-039', 'Town Hall', 'Share the roadmap', 'An all-hands', 'Corporate', '2030-10-01 10:00:00', '2030-10-01 12:00:00', 80,
     'A projector and two microphones', 'On-site AV technician for the keynote', NULL, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
