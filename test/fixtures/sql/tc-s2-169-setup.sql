-- tc-s2-169-setup.sql: USR-006's events in statuses a change request is,
-- and is not, available for.
--
-- Pre-condition for TC-S2-169 (Story 36 AC-10). Load AFTER base-users.sql and
-- tc-s2-159-setup.sql. All 1 Oct 2030 09:00-17:00 UTC, 120 expected.
--
--   EVT-066  CONFIRMED  (allowed)
--   EVT-068      DRAFT
--   EVT-064  CANCELLED
--   EVT-065  COMPLETED
--   EVT-071   REJECTED

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-066', 'USR-006', 'USR-004', 'Confirmed event', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-068', 'USR-006', 'USR-004', 'Draft event', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'DRAFT'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-064', 'USR-006', 'USR-004', 'Cancelled event', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'CANCELLED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-065', 'USR-006', 'USR-004', 'Completed event', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'COMPLETED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-071', 'USR-006', 'USR-004', 'Rejected event', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'REJECTED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
