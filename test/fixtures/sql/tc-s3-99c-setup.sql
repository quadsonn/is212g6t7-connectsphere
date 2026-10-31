-- tc-s3-99c-setup.sql: the Attendee browse list: open, full, closed and not-yet-open events.
--
-- Pre-condition for the browse-list test (Story 33 behaviour, kept) (Story 46). Load AFTER tc-s3-99-setup.sql.
-- The test freezes "now" at 1 Mar 2030 00:00 UTC; every date below is fixed
-- relative to it. Unless stated, an event is CONFIRMED, registration enabled,
-- 50 places, 31 Mar 2030 00:00-04:00 UTC, with the default window (opens 2
-- months before, closes 3 days before the start).
--
--   EVT-229 "Open", EVT-230 "Full" (1 place), EVT-231 "Closed" (closed 1 second ago),
--   EVT-232 "Not yet open" (opens 6 Mar 2030)

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "status", "registrationEnabled", "registrationOpensAt", "registrationClosesAt", "createdAt", "updatedAt") VALUES
  ('EVT-229', 'USR-006', 'USR-004', 'Open', 'Meet employers', 'Stalls and talks', 'Careers', '2030-03-31 00:00:00', '2030-03-31 04:00:00', 50, 'CONFIRMED'::"EventStatus", true, NULL, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-230', 'USR-006', 'USR-004', 'Full', 'Meet employers', 'Stalls and talks', 'Careers', '2030-03-31 00:00:00', '2030-03-31 04:00:00', 1, 'CONFIRMED'::"EventStatus", true, NULL, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-231', 'USR-006', 'USR-004', 'Closed', 'Meet employers', 'Stalls and talks', 'Careers', '2030-03-31 00:00:00', '2030-03-31 04:00:00', 50, 'CONFIRMED'::"EventStatus", true, NULL, '2030-02-28 23:59:59', '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-232', 'USR-006', 'USR-004', 'Not yet open', 'Meet employers', 'Stalls and talks', 'Careers', '2030-03-31 00:00:00', '2030-03-31 04:00:00', 50, 'CONFIRMED'::"EventStatus", true, '2030-03-06 00:00:00', NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00');
