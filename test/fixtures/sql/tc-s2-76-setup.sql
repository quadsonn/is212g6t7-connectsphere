-- tc-s2-76-setup.sql: three recorded changes to the tc-s2-68 event, inserted
-- out of date order.
--
-- Pre-condition for TC-S2-76 (Story 25 AC-1): the history must come back oldest
-- first whatever order the rows were written in. Load AFTER base-users.sql and
-- tc-s2-68-setup.sql.
--
--   CHG-002  2026-10-02 10:00  expectedAttendance 320 -> 350   by USR-004
--   CHG-003   2026-10-03 10:00  programme null -> "First draft"  by USR-004
--   CHG-001   2026-10-01 10:00  equipmentNeeds "One projector" -> "Two projectors"  by USR-004

INSERT INTO "EventChange" ("id", "eventId", "changedById", "changes", "requiresReview", "createdAt") VALUES
  ('CHG-002', 'EVT-105', 'USR-004', '[{"field": "expectedAttendance", "previous": 320, "next": 350}]', false, '2026-10-02 10:00:00'),
  ('CHG-003',  'EVT-105', 'USR-004', '[{"field": "programme", "previous": null, "next": "First draft"}]', false, '2026-10-03 10:00:00'),
  ('CHG-001',  'EVT-105', 'USR-004', '[{"field": "equipmentNeeds", "previous": "One projector", "next": "Two projectors"}]', false, '2026-10-01 10:00:00');
