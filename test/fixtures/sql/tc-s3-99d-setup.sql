-- tc-s3-99d-setup.sql: events the Attendee browse list must hide, and one it shows.
--
-- Pre-condition for the browse-list test (Story 33 behaviour, kept) (Story 46). Load AFTER tc-s3-99-setup.sql.
-- The test freezes "now" at 1 Mar 2030 00:00 UTC; every date below is fixed
-- relative to it. Unless stated, an event is CONFIRMED, registration enabled,
-- 50 places, 31 Mar 2030 00:00-04:00 UTC, with the default window (opens 2
-- months before, closes 3 days before the start).
--
--   EVT-233 "Mine", EVT-234 "Planning" (PLANNING), EVT-235 "Registration off",
--   EVT-236 "Started" (28 Feb - 2 Mar 2030), EVT-237 "Visible"

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "status", "registrationEnabled", "registrationOpensAt", "registrationClosesAt", "createdAt", "updatedAt") VALUES
  ('EVT-233', 'USR-006', 'USR-004', 'Mine', 'Meet employers', 'Stalls and talks', 'Careers', '2030-03-31 00:00:00', '2030-03-31 04:00:00', 50, 'CONFIRMED'::"EventStatus", true, NULL, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-234', 'USR-006', 'USR-004', 'Planning', 'Meet employers', 'Stalls and talks', 'Careers', '2030-03-31 00:00:00', '2030-03-31 04:00:00', 50, 'PLANNING'::"EventStatus", true, NULL, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-235', 'USR-006', 'USR-004', 'Registration off', 'Meet employers', 'Stalls and talks', 'Careers', '2030-03-31 00:00:00', '2030-03-31 04:00:00', 50, 'CONFIRMED'::"EventStatus", false, NULL, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-236', 'USR-006', 'USR-004', 'Started', 'Meet employers', 'Stalls and talks', 'Careers', '2030-02-28 00:00:00', '2030-03-02 00:00:00', 50, 'CONFIRMED'::"EventStatus", true, NULL, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-237', 'USR-006', 'USR-004', 'Visible', 'Meet employers', 'Stalls and talks', 'Careers', '2030-03-31 00:00:00', '2030-03-31 04:00:00', 50, 'CONFIRMED'::"EventStatus", true, NULL, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00');
