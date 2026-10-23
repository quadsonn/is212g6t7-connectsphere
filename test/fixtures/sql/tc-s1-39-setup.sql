-- tc-s1-39-setup.sql: one request per event status, all owned by USR-006.
--
-- Pre-condition for TC-S1-39 (US-05 AC-1: every request shows its current
-- status). Load AFTER base-users.sql. Each row is named "Request <STATUS>" so
-- the test can match name to status. If a status is added to EventStatus
-- (e.g. Week 7 Change 6's safety-check stage), add its row here too.

INSERT INTO "EventRequest" (
  "id", "organiserId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "status", "clarificationRequest", "decisionReason", "createdAt", "updatedAt"
) VALUES
  ('EVT-140', 'USR-006', 'Request DRAFT', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'DRAFT'::"EventStatus", NULL, NULL, '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('EVT-144', 'USR-006', 'Request SUBMITTED', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'SUBMITTED'::"EventStatus", NULL, NULL, '2026-09-03 09:01:00', '2026-09-03 09:01:00'),
  ('EVT-145', 'USR-006', 'Request UNDER_REVIEW', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'UNDER_REVIEW'::"EventStatus", NULL, NULL, '2026-09-03 09:02:00', '2026-09-03 09:02:00'),
  ('EVT-134', 'USR-006', 'Request APPROVED', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'APPROVED'::"EventStatus", NULL, NULL, '2026-09-03 09:03:00', '2026-09-03 09:03:00'),
  ('EVT-136', 'USR-006', 'Request AWAITING_CLARIFICATION', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'AWAITING_CLARIFICATION'::"EventStatus", NULL, NULL, '2026-09-03 09:04:00', '2026-09-03 09:04:00'),
  ('EVT-143', 'USR-006', 'Request RETURNED', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'RETURNED'::"EventStatus", NULL, NULL, '2026-09-03 09:05:00', '2026-09-03 09:05:00'),
  ('EVT-142', 'USR-006', 'Request REJECTED', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'REJECTED'::"EventStatus", NULL, NULL, '2026-09-03 09:06:00', '2026-09-03 09:06:00'),
  ('EVT-141', 'USR-006', 'Request PLANNING', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'PLANNING'::"EventStatus", NULL, NULL, '2026-09-03 09:07:00', '2026-09-03 09:07:00'),
  ('EVT-135', 'USR-006', 'Request AWAITING_ARRANGEMENTS', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'AWAITING_ARRANGEMENTS'::"EventStatus", NULL, NULL, '2026-09-03 09:08:00', '2026-09-03 09:08:00'),
  ('EVT-139', 'USR-006', 'Request CONFIRMED', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'CONFIRMED'::"EventStatus", NULL, NULL, '2026-09-03 09:09:00', '2026-09-03 09:09:00'),
  ('EVT-138', 'USR-006', 'Request COMPLETED', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'COMPLETED'::"EventStatus", NULL, NULL, '2026-09-03 09:10:00', '2026-09-03 09:10:00'),
  ('EVT-137', 'USR-006', 'Request CANCELLED', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'CANCELLED'::"EventStatus", NULL, NULL, '2026-09-03 09:11:00', '2026-09-03 09:11:00'),
  ('EVT-155', 'USR-006', 'Request AWAITING_SAFETY_CHECK', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'AWAITING_SAFETY_CHECK'::"EventStatus", NULL, NULL, '2026-09-03 09:12:00', '2026-09-03 09:12:00'),
  ('EVT-156', 'USR-006', 'Request SAFETY_REJECTED', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'SAFETY_REJECTED'::"EventStatus", NULL, NULL, '2026-09-03 09:13:00', '2026-09-03 09:13:00');
