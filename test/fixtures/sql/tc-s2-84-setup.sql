-- tc-s2-84-setup.sql: a COMPLETED event, still assigned to u-coordinator-a.
--
-- Pre-condition for TC-S2-84 (Story 26 AC-1): a finished event can no longer be
-- handed on. Load AFTER base-users.sql.
--
--   e-s2-finished  COMPLETED "Finished event", u-organiser / u-coordinator-a

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "registrationEnabled", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-finished', 'u-organiser', 'u-coordinator-a', 'Finished event', 'Welcome new students', 'Full-day programme', 'Student engagement',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, NULL, false, 'COMPLETED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
