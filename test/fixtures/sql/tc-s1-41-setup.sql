-- tc-s1-41-setup.sql: two REJECTED requests with their Coordinator's reasons.
--
-- Pre-condition for TC-S1-41 (US-05 AC-2). Load AFTER base-users.sql.
-- Both owned by USR-006. EVT-011 is the newest, so it is
-- first in the Organiser's list; EVT-010 is opened by ID.
--
--   EVT-011  REJECTED  "Clashes with the examination period"
--   EVT-010  REJECTED  "Venue capacity insufficient"

INSERT INTO "EventRequest" (
  "id", "organiserId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "status", "clarificationRequest", "decisionReason", "createdAt", "updatedAt"
) VALUES
  ('EVT-010', 'USR-006', 'Seeded request', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'REJECTED'::"EventStatus", NULL, 'Venue capacity insufficient', '2026-09-03 10:00:00', '2026-09-03 10:00:00'),
  ('EVT-011', 'USR-006', 'Seeded request', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'REJECTED'::"EventStatus", NULL, 'Clashes with the examination period', '2026-09-03 10:05:00', '2026-09-03 10:05:00');
