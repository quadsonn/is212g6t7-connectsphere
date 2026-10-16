-- tc-s1-02-setup.sql: a catalogue of event requests in every review state.
--
-- Pre-condition for TC-S1-02 (and the other US-07/08/09 test cases that need a
-- request in a specific status). Load AFTER base-users.sql. Tests look these
-- rows up by ID; specs that read a whole list use tc-s1-01-setup.sql instead.
--
-- All raised by u-organiser and assigned to u-coordinator-a, unless noted:
--
--   e-submitted         SUBMITTED
--   e-submitted-2       SUBMITTED (a second, independent request)
--   e-draft             DRAFT
--   e-under-review      UNDER_REVIEW
--   e-under-review-2    UNDER_REVIEW (a second, independent request)
--   e-approved          APPROVED
--   e-rejected          REJECTED
--   e-returned          RETURNED, with clarificationRequest 'Please confirm the attendance figure'
--   e-cancelled         CANCELLED
--   e-with-question     SUBMITTED, with clarificationRequest 'An earlier question'
--   e-stale             SUBMITTED, with clarificationRequest 'An earlier question'
--                       and decisionReason 'An earlier rejection'
--   e-unassigned        SUBMITTED, no coordinator (in the review pool)

INSERT INTO "EventRequest" (
  "id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status",
  "clarificationRequest", "decisionReason", "createdAt", "updatedAt"
) VALUES
  ('e-submitted',      'u-organiser', 'u-coordinator-a', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme with talks and booths', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, 'SUBMITTED'::"EventStatus",    NULL, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-submitted-2',    'u-organiser', 'u-coordinator-a', 'Careers Fair 2030',         'Connect students with employers', 'Afternoon fair with booths', 'Careers',      '2030-11-05 13:00:00', '2030-11-05 17:00:00', 200, 'SUBMITTED'::"EventStatus",    NULL, NULL, '2026-09-02 09:01:00', '2026-09-02 09:01:00'),
  ('e-draft',          'u-organiser', 'u-coordinator-a', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme with talks and booths', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, 'DRAFT'::"EventStatus",        NULL, NULL, '2026-09-02 09:02:00', '2026-09-02 09:02:00'),
  ('e-under-review',   'u-organiser', 'u-coordinator-a', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme with talks and booths', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, 'UNDER_REVIEW'::"EventStatus", NULL, NULL, '2026-09-02 09:03:00', '2026-09-02 09:03:00'),
  ('e-under-review-2', 'u-organiser', 'u-coordinator-a', 'Careers Fair 2030',         'Connect students with employers', 'Afternoon fair with booths', 'Careers',      '2030-11-05 13:00:00', '2030-11-05 17:00:00', 200, 'UNDER_REVIEW'::"EventStatus", NULL, NULL, '2026-09-02 09:04:00', '2026-09-02 09:04:00'),
  ('e-approved',       'u-organiser', 'u-coordinator-a', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme with talks and booths', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, 'APPROVED'::"EventStatus",     NULL, NULL, '2026-09-02 09:05:00', '2026-09-02 09:05:00'),
  ('e-rejected',       'u-organiser', 'u-coordinator-a', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme with talks and booths', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, 'REJECTED'::"EventStatus",     NULL, NULL, '2026-09-02 09:06:00', '2026-09-02 09:06:00'),
  ('e-returned',       'u-organiser', 'u-coordinator-a', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme with talks and booths', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, 'RETURNED'::"EventStatus",     'Please confirm the attendance figure', NULL, '2026-09-02 09:07:00', '2026-09-02 09:07:00'),
  ('e-cancelled',      'u-organiser', 'u-coordinator-a', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme with talks and booths', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, 'CANCELLED'::"EventStatus",    NULL, NULL, '2026-09-02 09:08:00', '2026-09-02 09:08:00'),
  ('e-with-question',  'u-organiser', 'u-coordinator-a', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme with talks and booths', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, 'SUBMITTED'::"EventStatus",    'An earlier question', NULL, '2026-09-02 09:09:00', '2026-09-02 09:09:00'),
  ('e-stale',          'u-organiser', 'u-coordinator-a', 'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme with talks and booths', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, 'SUBMITTED'::"EventStatus",    'An earlier question', 'An earlier rejection', '2026-09-02 09:10:00', '2026-09-02 09:10:00'),
  ('e-unassigned',     'u-organiser', NULL,              'Freshman Orientation 2030', 'Welcome new students', 'Full-day programme with talks and booths', 'Student engagement', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, 'SUBMITTED'::"EventStatus",    NULL, NULL, '2026-09-02 09:11:00', '2026-09-02 09:11:00');
