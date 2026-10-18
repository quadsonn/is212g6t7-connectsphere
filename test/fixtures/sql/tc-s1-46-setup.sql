-- tc-s1-46-setup.sql: one request of u-organiser's and two of another Organiser's.
--
-- Pre-condition for TC-S1-46 (US-05 AC-5). Load AFTER base-users.sql AND
-- tc-s1-22-setup.sql (which creates u-organiser-2).
--
--   e-mine             DRAFT     "Mine"    owned by u-organiser
--   e-theirs           DRAFT     "Theirs"  owned by u-organiser-2
--   e-theirs-rejected  REJECTED  "Theirs"  owned by u-organiser-2, reason "CONFIDENTIAL internal note"

INSERT INTO "EventRequest" (
  "id", "organiserId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "status", "clarificationRequest", "decisionReason", "createdAt", "updatedAt"
) VALUES
  ('e-mine', 'u-organiser', 'Mine', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'DRAFT'::"EventStatus", NULL, NULL, '2026-09-03 13:00:00', '2026-09-03 13:00:00'),
  ('e-theirs', 'u-organiser-2', 'Theirs', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'DRAFT'::"EventStatus", NULL, NULL, '2026-09-03 13:01:00', '2026-09-03 13:01:00'),
  ('e-theirs-rejected', 'u-organiser-2', 'Theirs', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'REJECTED'::"EventStatus", NULL, 'CONFIDENTIAL internal note', '2026-09-03 13:02:00', '2026-09-03 13:02:00');
