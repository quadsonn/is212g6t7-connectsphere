-- tc-s3-99b-setup.sql: an event for every registration-period and capacity case.
--
-- Pre-condition for TC-S3-99 to 106 (all but the browse-list tests) (Story 46). Load AFTER tc-s3-99-setup.sql.
-- The test freezes "now" at 1 Mar 2030 00:00 UTC; every date below is fixed
-- relative to it. Unless stated, an event is CONFIRMED, registration enabled,
-- 50 places, 31 Mar 2030 00:00-04:00 UTC, with the default window (opens 2
-- months before, closes 3 days before the start).
--
--   EVT-217  not yet open: opens 3 Mar, closes 10 Mar 2030
--   EVT-218  closed: opened 20 Feb, closed 1 Mar 2030 minus 1 second
--   EVT-219  open: opened 28 Feb, closes 2 Mar 2030
--   EVT-220  registration not enabled
--   EVT-221  2 places;  EVT-222  1 place;  EVT-223  3 places
--   EVT-224  the default event (open, 50 places)
--   EVT-225 "Soon (will be withdrawn)" 11 Mar, EVT-226 "Later" 10 Apr, EVT-227 "Middle" 21 Mar 2030
--   EVT-228  closes exactly at "now" (1 Mar 2030 00:00)

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "status", "registrationEnabled", "registrationOpensAt", "registrationClosesAt", "createdAt", "updatedAt") VALUES
  ('EVT-217', 'USR-006', 'USR-004', 'Careers Fair', 'Meet employers', 'Stalls and talks', 'Careers', '2030-03-31 00:00:00', '2030-03-31 04:00:00', 50, 'CONFIRMED'::"EventStatus", true, '2030-03-03 00:00:00', '2030-03-10 00:00:00', '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-218', 'USR-006', 'USR-004', 'Careers Fair', 'Meet employers', 'Stalls and talks', 'Careers', '2030-03-31 00:00:00', '2030-03-31 04:00:00', 50, 'CONFIRMED'::"EventStatus", true, '2030-02-20 00:00:00', '2030-02-28 23:59:59', '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-219', 'USR-006', 'USR-004', 'Careers Fair', 'Meet employers', 'Stalls and talks', 'Careers', '2030-03-31 00:00:00', '2030-03-31 04:00:00', 50, 'CONFIRMED'::"EventStatus", true, '2030-02-28 00:00:00', '2030-03-02 00:00:00', '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-220', 'USR-006', 'USR-004', 'Careers Fair', 'Meet employers', 'Stalls and talks', 'Careers', '2030-03-31 00:00:00', '2030-03-31 04:00:00', 50, 'CONFIRMED'::"EventStatus", false, NULL, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-221', 'USR-006', 'USR-004', 'Careers Fair', 'Meet employers', 'Stalls and talks', 'Careers', '2030-03-31 00:00:00', '2030-03-31 04:00:00', 2, 'CONFIRMED'::"EventStatus", true, NULL, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-222', 'USR-006', 'USR-004', 'Careers Fair', 'Meet employers', 'Stalls and talks', 'Careers', '2030-03-31 00:00:00', '2030-03-31 04:00:00', 1, 'CONFIRMED'::"EventStatus", true, NULL, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-223', 'USR-006', 'USR-004', 'Careers Fair', 'Meet employers', 'Stalls and talks', 'Careers', '2030-03-31 00:00:00', '2030-03-31 04:00:00', 3, 'CONFIRMED'::"EventStatus", true, NULL, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-224', 'USR-006', 'USR-004', 'Careers Fair', 'Meet employers', 'Stalls and talks', 'Careers', '2030-03-31 00:00:00', '2030-03-31 04:00:00', 50, 'CONFIRMED'::"EventStatus", true, NULL, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-225', 'USR-006', 'USR-004', 'Soon (will be withdrawn)', 'Meet employers', 'Stalls and talks', 'Careers', '2030-03-11 00:00:00', '2030-03-11 01:00:00', 50, 'CONFIRMED'::"EventStatus", true, NULL, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-226', 'USR-006', 'USR-004', 'Later', 'Meet employers', 'Stalls and talks', 'Careers', '2030-04-10 00:00:00', '2030-04-10 01:00:00', 50, 'CONFIRMED'::"EventStatus", true, NULL, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-227', 'USR-006', 'USR-004', 'Middle', 'Meet employers', 'Stalls and talks', 'Careers', '2030-03-21 00:00:00', '2030-03-21 01:00:00', 50, 'CONFIRMED'::"EventStatus", true, NULL, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-228', 'USR-006', 'USR-004', 'Careers Fair', 'Meet employers', 'Stalls and talks', 'Careers', '2030-03-31 00:00:00', '2030-03-31 04:00:00', 50, 'CONFIRMED'::"EventStatus", true, '2030-02-01 00:00:00', '2030-03-01 00:00:00', '2026-09-02 09:00:00', '2026-09-02 09:00:00');
