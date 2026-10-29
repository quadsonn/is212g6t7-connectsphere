-- tc-s4-79-setup.sql: both Technical Support members are busy during the Town Hall.
--
-- Pre-condition for TC-S4-79 (nobody available). Load AFTER tc-s4-76-setup.sql.
--
--   EVT-309 "Product Launch" 09:00-11:00 UTC, Wei; EVT-310 "Board Meeting" 11:30-12:30 UTC, Nadia

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "technicalSupportNeeds", "technicalSupportId",
  "status", "createdAt", "updatedAt") VALUES
  ('EVT-309', 'USR-038', 'USR-039', 'Product Launch', 'Share the roadmap', 'An all-hands', 'Corporate', '2030-10-01 09:00:00', '2030-10-01 11:00:00', 80,
     'A projector and two microphones', 'On-site AV technician for the keynote', 'USR-042', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-310', 'USR-038', 'USR-039', 'Board Meeting', 'Share the roadmap', 'An all-hands', 'Corporate', '2030-10-01 11:30:00', '2030-10-01 12:30:00', 80,
     'A projector and two microphones', 'On-site AV technician for the keynote', 'USR-043', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
