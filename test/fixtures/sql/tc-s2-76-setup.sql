-- tc-s2-76-setup.sql: three recorded changes to the tc-s2-68 event, inserted
-- out of date order.
--
-- Pre-condition for TC-S2-76 (Story 25 AC-1): the history must come back oldest
-- first whatever order the rows were written in. Load AFTER base-users.sql and
-- tc-s2-68-setup.sql.
--
--   c-s2-76-second  2026-10-02 10:00  expectedAttendance 320 -> 350   by u-coordinator-a
--   c-s2-76-third   2026-10-03 10:00  programme null -> "First draft"  by u-coordinator-a
--   c-s2-76-first   2026-10-01 10:00  equipmentNeeds "One projector" -> "Two projectors"  by u-coordinator-a

INSERT INTO "EventChange" ("id", "eventId", "changedById", "changes", "requiresReview", "createdAt") VALUES
  ('c-s2-76-second', 'e-s2-planning', 'u-coordinator-a', '[{"field": "expectedAttendance", "previous": 320, "next": 350}]', false, '2026-10-02 10:00:00'),
  ('c-s2-76-third',  'e-s2-planning', 'u-coordinator-a', '[{"field": "programme", "previous": null, "next": "First draft"}]', false, '2026-10-03 10:00:00'),
  ('c-s2-76-first',  'e-s2-planning', 'u-coordinator-a', '[{"field": "equipmentNeeds", "previous": "One projector", "next": "Two projectors"}]', false, '2026-10-01 10:00:00');
