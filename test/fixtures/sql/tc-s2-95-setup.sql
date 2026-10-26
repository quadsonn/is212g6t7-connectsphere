-- tc-s2-95-setup.sql: an event in planning that is open for registration, so
-- an Attendee can view it.
--
-- Pre-condition for TC-S2-95 (Story 27 AC-3): Attendees never see the
-- equipment or technical requirements. Load AFTER base-users.sql.
--
--   EVT-101  PLANNING "Open day", registration enabled, USR-006 / USR-004

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "registrationEnabled", "status", "createdAt", "updatedAt") VALUES
  ('EVT-101', 'USR-006', 'USR-004', 'Open day', 'Welcome new students', 'Full-day programme', 'Student engagement',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, NULL, true, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
