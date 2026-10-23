-- tc-s2-137-setup.sql: events where the Register option must not apply.
--
-- Pre-condition for TC-S2-137 (Story 33 AC-1) and TC-S2-141 (AC-6). Load
-- AFTER base-users.sql. Same times and capacity as EVT-078 unless noted.
--
--   EVT-109  CONFIRMED, registration disabled
--   EVT-112  PLANNING (not yet confirmed), registration enabled
--   EVT-110     DRAFT (Attendees can't see it at all)
--   EVT-111  CONFIRMED, opens 1 Jan 2030 (in the future)
--   EVT-108    CONFIRMED, opened 1 Jan 2019, closed 1 Jan 2020

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "registrationEnabled", "registrationOpensAt", "registrationClosesAt",
  "status", "createdAt", "updatedAt") VALUES
  ('EVT-109', 'USR-006', 'USR-004', 'Registration off', 'Purpose', 'Description', 'Social',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, false, '2026-01-01 00:00:00', '2030-09-28 00:00:00', 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-112', 'USR-006', 'USR-004', 'Still planning', 'Purpose', 'Description', 'Social',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, true, '2026-01-01 00:00:00', '2030-09-28 00:00:00', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-110', 'USR-006', 'USR-004', 'Draft event', 'Purpose', 'Description', 'Social',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, true, '2026-01-01 00:00:00', '2030-09-28 00:00:00', 'DRAFT'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-111', 'USR-006', 'USR-004', 'Opens later', 'Purpose', 'Description', 'Social',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, true, '2030-01-01 00:00:00', '2030-09-28 00:00:00', 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-108', 'USR-006', 'USR-004', 'Already closed', 'Purpose', 'Description', 'Social',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, true, '2019-01-01 00:00:00', '2020-01-01 00:00:00', 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
