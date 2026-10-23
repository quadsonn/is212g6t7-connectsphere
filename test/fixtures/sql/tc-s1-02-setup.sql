-- tc-s1-02-setup.sql: a catalogue of event requests in every review state.
--
-- Pre-condition for TC-S1-02 (and the other US-07/08/09 test cases that need a
-- request in a specific status). Load AFTER base-users.sql. Tests look these
-- rows up by ID; specs that read a whole list use tc-s1-01-setup.sql instead.
--
-- All raised by USR-006 and assigned to USR-004, unless noted:
--
--   EVT-146         SUBMITTED
--   EVT-147       SUBMITTED (a second, independent request)
--   EVT-004             DRAFT
--   EVT-151      UNDER_REVIEW
--   EVT-152    UNDER_REVIEW (a second, independent request)
--   EVT-001          APPROVED
--   EVT-009          REJECTED
--   EVT-012          RETURNED, with clarificationRequest 'Please confirm the attendance figure'
--   EVT-003         CANCELLED
--   EVT-154     SUBMITTED, with clarificationRequest 'An earlier question'
--   EVT-133             SUBMITTED, with clarificationRequest 'An earlier question'
--                       and decisionReason 'An earlier rejection'
--   EVT-150        SUBMITTED, no coordinator (in the review pool)

INSERT INTO "EventRequest" (
  "id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status",
  "clarificationRequest", "decisionReason", "createdAt", "updatedAt"
) VALUES
  ('EVT-146',      'USR-006', 'USR-004', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme with talks and booths', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, 'SUBMITTED'::"EventStatus",    NULL, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-147',    'USR-006', 'USR-004', 'Careers Fair 2030',         'Connect students with employers', 'Afternoon fair with booths', 'Careers',      '2030-11-05 13:00:00', '2030-11-05 17:00:00', 200, 'SUBMITTED'::"EventStatus",    NULL, NULL, '2026-09-02 09:01:00', '2026-09-02 09:01:00'),
  ('EVT-004',          'USR-006', 'USR-004', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme with talks and booths', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, 'DRAFT'::"EventStatus",        NULL, NULL, '2026-09-02 09:02:00', '2026-09-02 09:02:00'),
  ('EVT-151',   'USR-006', 'USR-004', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme with talks and booths', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, 'UNDER_REVIEW'::"EventStatus", NULL, NULL, '2026-09-02 09:03:00', '2026-09-02 09:03:00'),
  ('EVT-152', 'USR-006', 'USR-004', 'Careers Fair 2030',         'Connect students with employers', 'Afternoon fair with booths', 'Careers',      '2030-11-05 13:00:00', '2030-11-05 17:00:00', 200, 'UNDER_REVIEW'::"EventStatus", NULL, NULL, '2026-09-02 09:04:00', '2026-09-02 09:04:00'),
  ('EVT-001',       'USR-006', 'USR-004', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme with talks and booths', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, 'APPROVED'::"EventStatus",     NULL, NULL, '2026-09-02 09:05:00', '2026-09-02 09:05:00'),
  ('EVT-009',       'USR-006', 'USR-004', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme with talks and booths', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, 'REJECTED'::"EventStatus",     NULL, NULL, '2026-09-02 09:06:00', '2026-09-02 09:06:00'),
  ('EVT-012',       'USR-006', 'USR-004', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme with talks and booths', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, 'RETURNED'::"EventStatus",     'Please confirm the attendance figure', NULL, '2026-09-02 09:07:00', '2026-09-02 09:07:00'),
  ('EVT-003',      'USR-006', 'USR-004', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme with talks and booths', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, 'CANCELLED'::"EventStatus",    NULL, NULL, '2026-09-02 09:08:00', '2026-09-02 09:08:00'),
  ('EVT-154',  'USR-006', 'USR-004', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme with talks and booths', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, 'SUBMITTED'::"EventStatus",    'An earlier question', NULL, '2026-09-02 09:09:00', '2026-09-02 09:09:00'),
  ('EVT-133',          'USR-006', 'USR-004', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme with talks and booths', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, 'SUBMITTED'::"EventStatus",    'An earlier question', 'An earlier rejection', '2026-09-02 09:10:00', '2026-09-02 09:10:00'),
  ('EVT-150',     'USR-006', NULL,              'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme with talks and booths', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, 'SUBMITTED'::"EventStatus",    NULL, NULL, '2026-09-02 09:11:00', '2026-09-02 09:11:00');
