-- tc-s1-46-setup.sql: one request of USR-006's and two of another Organiser's.
--
-- Pre-condition for TC-S1-46 (US-05 AC-5). Load AFTER base-users.sql AND
-- tc-s1-22-setup.sql (which creates USR-007).
--
--   EVT-008             DRAFT     "Mine"    owned by USR-006
--   EVT-148           DRAFT     "Theirs"  owned by USR-007
--   EVT-149  REJECTED  "Theirs"  owned by USR-007, reason "CONFIDENTIAL internal note"

INSERT INTO "EventRequest" (
  "id", "organiserId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "status", "clarificationRequest", "decisionReason", "createdAt", "updatedAt"
) VALUES
  ('EVT-008', 'USR-006', 'Mine', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'DRAFT'::"EventStatus", NULL, NULL, '2026-09-03 13:00:00', '2026-09-03 13:00:00'),
  ('EVT-148', 'USR-007', 'Theirs', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'DRAFT'::"EventStatus", NULL, NULL, '2026-09-03 13:01:00', '2026-09-03 13:01:00'),
  ('EVT-149', 'USR-007', 'Theirs', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'REJECTED'::"EventStatus", NULL, 'CONFIDENTIAL internal note', '2026-09-03 13:02:00', '2026-09-03 13:02:00');
