-- tc-s4-65b-setup.sql: a confirmed event whose registration has not opened yet.
--
-- Pre-condition for TC-S4-65 (no "opens" notice before registration opens).
-- Load AFTER tc-s4-65-setup.sql.
--
--   EVT-303 "Spring Gala" CONFIRMED, registration enabled, opens 1 Oct 2030, event 1 Dec 2030

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "registrationEnabled",
  "registrationOpensAt", "createdAt", "updatedAt") VALUES
  ('EVT-303', 'USR-006', 'USR-004', 'Spring Gala', 'Celebrate', 'An evening', 'Social',
     '2030-12-01 18:00:00', '2030-12-01 22:00:00', 100, 'CONFIRMED'::"EventStatus", true,
     '2030-10-01 00:00:00', '2026-09-02 09:00:00', '2026-09-02 09:00:00');
