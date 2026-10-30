-- tc-s3-107b-setup.sql: an "other" event in each status the rejection is
-- allowed or refused from.
--
-- Pre-condition for TC-S3-110 (Story 47 AC-4: which statuses can be rejected as
-- unfulfillable). Load AFTER tc-s3-107-setup.sql.
--
--   EVT-239  "other", APPROVED
--   EVT-240  "other", AWAITING_ARRANGEMENTS
--   EVT-241  "other", SUBMITTED
--   EVT-242  "other", UNDER_REVIEW
--   EVT-243  "other", CONFIRMED
--   EVT-244  "other", COMPLETED
--   EVT-245  "other", CANCELLED
--   EVT-246  "other", REJECTED

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-239', 'USR-006', 'USR-004', 'other', 'p', 'd', 'c', '2030-10-01 01:00:00', '2030-10-01 09:00:00', 120, 'Projectors', 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-240', 'USR-006', 'USR-004', 'other', 'p', 'd', 'c', '2030-10-01 01:00:00', '2030-10-01 09:00:00', 120, 'Projectors', 'AWAITING_ARRANGEMENTS'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-241', 'USR-006', 'USR-004', 'other', 'p', 'd', 'c', '2030-10-01 01:00:00', '2030-10-01 09:00:00', 120, 'Projectors', 'SUBMITTED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-242', 'USR-006', 'USR-004', 'other', 'p', 'd', 'c', '2030-10-01 01:00:00', '2030-10-01 09:00:00', 120, 'Projectors', 'UNDER_REVIEW'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-243', 'USR-006', 'USR-004', 'other', 'p', 'd', 'c', '2030-10-01 01:00:00', '2030-10-01 09:00:00', 120, 'Projectors', 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-244', 'USR-006', 'USR-004', 'other', 'p', 'd', 'c', '2030-10-01 01:00:00', '2030-10-01 09:00:00', 120, 'Projectors', 'COMPLETED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-245', 'USR-006', 'USR-004', 'other', 'p', 'd', 'c', '2030-10-01 01:00:00', '2030-10-01 09:00:00', 120, 'Projectors', 'CANCELLED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-246', 'USR-006', 'USR-004', 'other', 'p', 'd', 'c', '2030-10-01 01:00:00', '2030-10-01 09:00:00', 120, 'Projectors', 'REJECTED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
