-- tc-s2-169-setup.sql: u-organiser's events in statuses a change request is,
-- and is not, available for.
--
-- Pre-condition for TC-S2-169 (Story 36 AC-10). Load AFTER base-users.sql and
-- tc-s2-159-setup.sql. All 1 Oct 2030 09:00-17:00 UTC, 120 expected.
--
--   e-s2-cr-confirmed  CONFIRMED  (allowed)
--   e-s2-cr-draft      DRAFT
--   e-s2-cr-cancelled  CANCELLED
--   e-s2-cr-completed  COMPLETED
--   e-s2-cr-rejected   REJECTED

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-cr-confirmed', 'u-organiser', 'u-coordinator-a', 'Confirmed event', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-cr-draft', 'u-organiser', 'u-coordinator-a', 'Draft event', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'DRAFT'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-cr-cancelled', 'u-organiser', 'u-coordinator-a', 'Cancelled event', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'CANCELLED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-cr-completed', 'u-organiser', 'u-coordinator-a', 'Completed event', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'COMPLETED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-cr-rejected', 'u-organiser', 'u-coordinator-a', 'Rejected event', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'REJECTED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
