-- tc-s2-136-setup.sql: a confirmed event open for registration now.
--
-- Pre-condition for TC-S2-136 (Story 33 AC-1), and the base for TC-S2-137 to
-- TC-S2-143. Load AFTER base-users.sql.
--
--   EVT-078  CONFIRMED "Spring Gala", registration enabled, opens 1 Jan 2026,
--              closes 28 Sep 2030, event 1 Oct 2030 09:00-17:00 UTC, capacity 100

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "registrationEnabled", "registrationOpensAt", "registrationClosesAt",
  "status", "createdAt", "updatedAt") VALUES
  ('EVT-078', 'USR-006', 'USR-004', 'Spring Gala', 'Purpose', 'Description', 'Social',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, true, '2026-01-01 00:00:00', '2030-09-28 00:00:00', 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
