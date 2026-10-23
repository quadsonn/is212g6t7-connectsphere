-- tc-s1-42-setup.sql: drafts with and without an outstanding clarification.
--
-- Pre-condition for TC-S1-42 (US-05 AC-3). Load AFTER base-users.sql.
-- All owned by USR-006. EVT-005 is the newest, so it is first in
-- the Organiser's list.
--
--   EVT-006     DRAFT  "Plain draft", no question
--   EVT-007  DRAFT  "Returned for clarification", "Which venue did you have in mind?"
--   EVT-005     DRAFT  "Please confirm the expected attendance figure"

INSERT INTO "EventRequest" (
  "id", "organiserId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "status", "clarificationRequest", "decisionReason", "createdAt", "updatedAt"
) VALUES
  ('EVT-006', 'USR-006', 'Plain draft', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'DRAFT'::"EventStatus", NULL, NULL, '2026-09-03 11:00:00', '2026-09-03 11:00:00'),
  ('EVT-007', 'USR-006', 'Returned for clarification', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'DRAFT'::"EventStatus", 'Which venue did you have in mind?', NULL, '2026-09-03 11:01:00', '2026-09-03 11:01:00'),
  ('EVT-005', 'USR-006', 'Seeded request', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'DRAFT'::"EventStatus", 'Please confirm the expected attendance figure', NULL, '2026-09-03 11:05:00', '2026-09-03 11:05:00');
