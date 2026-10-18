-- tc-s2-137-setup.sql: events where the Register option must not apply.
--
-- Pre-condition for TC-S2-137 (Story 33 AC-1) and TC-S2-141 (AC-6). Load
-- AFTER base-users.sql. Same times and capacity as e-s2-gala unless noted.
--
--   e-s2-reg-disabled  CONFIRMED, registration disabled
--   e-s2-reg-planning  PLANNING (not yet confirmed), registration enabled
--   e-s2-reg-draft     DRAFT (Attendees can't see it at all)
--   e-s2-reg-not-open  CONFIRMED, opens 1 Jan 2030 (in the future)
--   e-s2-reg-closed    CONFIRMED, opened 1 Jan 2019, closed 1 Jan 2020

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "registrationEnabled", "registrationOpensAt", "registrationClosesAt",
  "status", "createdAt", "updatedAt") VALUES
  ('e-s2-reg-disabled', 'u-organiser', 'u-coordinator-a', 'Registration off', 'Purpose', 'Description', 'Social',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, false, '2026-01-01 00:00:00', '2030-09-28 00:00:00', 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-reg-planning', 'u-organiser', 'u-coordinator-a', 'Still planning', 'Purpose', 'Description', 'Social',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, true, '2026-01-01 00:00:00', '2030-09-28 00:00:00', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-reg-draft', 'u-organiser', 'u-coordinator-a', 'Draft event', 'Purpose', 'Description', 'Social',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, true, '2026-01-01 00:00:00', '2030-09-28 00:00:00', 'DRAFT'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-reg-not-open', 'u-organiser', 'u-coordinator-a', 'Opens later', 'Purpose', 'Description', 'Social',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, true, '2030-01-01 00:00:00', '2030-09-28 00:00:00', 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-reg-closed', 'u-organiser', 'u-coordinator-a', 'Already closed', 'Purpose', 'Description', 'Social',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, true, '2019-01-01 00:00:00', '2020-01-01 00:00:00', 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
