-- tc-s3-75b-setup.sql: the Organiser's events that cannot be cancelled.
--
-- Pre-condition for TC-S3-75 (Story 43 AC-1). Load AFTER base-users.sql.
--
--   EVT-206 DRAFT, EVT-207 REJECTED, EVT-208 COMPLETED, EVT-209 CANCELLED
--   EVT-210 PLANNING but already started (1 Jan 2026)

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-206', 'USR-006', NULL,      'Draft fair',    'Purpose', 'Description', 'Social', '2030-12-05 01:00:00', '2030-12-05 09:00:00', 80, 'DRAFT'::"EventStatus",     '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-207', 'USR-006', 'USR-004', 'Rejected fair', 'Purpose', 'Description', 'Social', '2030-12-05 01:00:00', '2030-12-05 09:00:00', 80, 'REJECTED'::"EventStatus",  '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-208', 'USR-006', 'USR-004', 'Past fair',     'Purpose', 'Description', 'Social', '2025-12-05 01:00:00', '2025-12-05 09:00:00', 80, 'COMPLETED'::"EventStatus", '2025-09-02 09:00:00', '2025-12-06 09:00:00'),
  ('EVT-209', 'USR-006', 'USR-004', 'Called-off fair','Purpose','Description', 'Social', '2030-12-05 01:00:00', '2030-12-05 09:00:00', 80, 'CANCELLED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-210', 'USR-006', 'USR-004', 'Running fair',  'Purpose', 'Description', 'Social', '2026-01-01 01:00:00', '2030-12-31 09:00:00', 80, 'PLANNING'::"EventStatus",  '2025-09-02 09:00:00', '2025-09-02 09:00:00');
