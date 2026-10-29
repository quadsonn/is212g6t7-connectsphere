-- tc-s4-77-setup.sql: Wei is busy on an overlapping event.
--
-- Pre-condition for TC-S4-77. Load AFTER tc-s4-76-setup.sql.
--
--   EVT-306 "Product Launch" PLANNING, 1 Oct 2030 11:00-13:00 UTC, Wei assigned

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "technicalSupportNeeds", "technicalSupportId",
  "status", "createdAt", "updatedAt") VALUES
  ('EVT-306', 'USR-038', 'USR-039', 'Product Launch', 'Share the roadmap', 'An all-hands', 'Corporate', '2030-10-01 11:00:00', '2030-10-01 13:00:00', 80,
     'A projector and two microphones', 'On-site AV technician for the keynote', 'USR-042', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
