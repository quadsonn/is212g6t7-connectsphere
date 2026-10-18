-- tc-s2-77-setup.sql: a request the Coordinator returned to the Organiser for changes.
--
-- Pre-condition for TC-S2-77 (Story 25 AC-1): the Organiser's amendment is part
-- of the event's history. Load AFTER base-users.sql.
--
--   e-s2-returned  RETURNED "Freshman Orientation 2030", u-organiser / u-coordinator-a, 320 expected

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-returned', 'u-organiser', 'u-coordinator-a', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme', 'Student engagement',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, 'Two projectors', 'RETURNED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
