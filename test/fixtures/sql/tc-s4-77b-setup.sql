-- tc-s4-77b-setup.sql: Wei's earlier event ends as the Town Hall starts.
--
-- Pre-condition for TC-S4-77 (back to back is not a conflict). Load AFTER tc-s4-76-setup.sql.
--
--   EVT-307 "Morning Session" PLANNING, 1 Oct 2030 08:00-10:00 UTC, Wei assigned

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "technicalSupportNeeds", "technicalSupportId",
  "status", "createdAt", "updatedAt") VALUES
  ('EVT-307', 'USR-038', 'USR-039', 'Morning Session', 'Share the roadmap', 'An all-hands', 'Corporate', '2030-10-01 08:00:00', '2030-10-01 10:00:00', 80,
     'A projector and two microphones', 'On-site AV technician for the keynote', 'USR-042', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
