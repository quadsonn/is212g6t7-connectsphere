-- tc-s1-45-setup.sql: one APPROVED request owned by USR-006.
--
-- Pre-condition for TC-S1-45 (US-05 AC-4: a later status change is shown on
-- the next read, not a cached one). Load AFTER base-users.sql.
--
--   EVT-002  APPROVED

INSERT INTO "EventRequest" (
  "id", "organiserId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "status", "clarificationRequest", "decisionReason", "createdAt", "updatedAt"
) VALUES
  ('EVT-002', 'USR-006', 'Seeded request', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'APPROVED'::"EventStatus", NULL, NULL, '2026-09-03 12:00:00', '2026-09-03 12:00:00');
