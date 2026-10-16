-- tc-s1-42-setup.sql: drafts with and without an outstanding clarification.
--
-- Pre-condition for TC-S1-42 (US-05 AC-3). Load AFTER base-users.sql.
-- All owned by u-organiser. e-draft-asked is the newest, so it is first in
-- the Organiser's list.
--
--   e-draft-plain     DRAFT  "Plain draft", no question
--   e-draft-returned  DRAFT  "Returned for clarification", "Which venue did you have in mind?"
--   e-draft-asked     DRAFT  "Please confirm the expected attendance figure"

INSERT INTO "EventRequest" (
  "id", "organiserId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "status", "clarificationRequest", "decisionReason", "createdAt", "updatedAt"
) VALUES
  ('e-draft-plain', 'u-organiser', 'Plain draft', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'DRAFT'::"EventStatus", NULL, NULL, '2026-09-03 11:00:00', '2026-09-03 11:00:00'),
  ('e-draft-returned', 'u-organiser', 'Returned for clarification', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'DRAFT'::"EventStatus", 'Which venue did you have in mind?', NULL, '2026-09-03 11:01:00', '2026-09-03 11:01:00'),
  ('e-draft-asked', 'u-organiser', 'Seeded request', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'DRAFT'::"EventStatus", 'Please confirm the expected attendance figure', NULL, '2026-09-03 11:05:00', '2026-09-03 11:05:00');
