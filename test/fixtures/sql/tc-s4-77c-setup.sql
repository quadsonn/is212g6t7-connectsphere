-- tc-s4-77c-setup.sql: Wei was assigned to an event that has since been cancelled.
--
-- Pre-condition for TC-S4-77 (a cancelled event holds nobody) and TC-S4-78 (it
-- drops out of Wei's list). Load AFTER tc-s4-76-setup.sql.
--
--   EVT-308 "Cancelled Launch" CANCELLED, 1 Oct 2030 11:00-13:00 UTC, Wei assigned

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "technicalSupportNeeds", "technicalSupportId",
  "status", "createdAt", "updatedAt") VALUES
  ('EVT-308', 'USR-038', 'USR-039', 'Cancelled Launch', 'Share the roadmap', 'An all-hands', 'Corporate', '2030-10-01 11:00:00', '2030-10-01 13:00:00', 80,
     'A projector and two microphones', 'On-site AV technician for the keynote', 'USR-042', 'CANCELLED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
