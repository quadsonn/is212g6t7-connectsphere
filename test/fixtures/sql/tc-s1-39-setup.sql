-- tc-s1-39-setup.sql: one request per event status, all owned by u-organiser.
--
-- Pre-condition for TC-S1-39 (US-05 AC-1: every request shows its current
-- status). Load AFTER base-users.sql. Each row is named "Request <STATUS>" so
-- the test can match name to status. If a status is added to EventStatus
-- (e.g. Week 7 Change 6's safety-check stage), add its row here too.

INSERT INTO "EventRequest" (
  "id", "organiserId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "status", "clarificationRequest", "decisionReason", "createdAt", "updatedAt"
) VALUES
  ('e-status-draft', 'u-organiser', 'Request DRAFT', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'DRAFT'::"EventStatus", NULL, NULL, '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('e-status-submitted', 'u-organiser', 'Request SUBMITTED', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'SUBMITTED'::"EventStatus", NULL, NULL, '2026-09-03 09:01:00', '2026-09-03 09:01:00'),
  ('e-status-under-review', 'u-organiser', 'Request UNDER_REVIEW', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'UNDER_REVIEW'::"EventStatus", NULL, NULL, '2026-09-03 09:02:00', '2026-09-03 09:02:00'),
  ('e-status-approved', 'u-organiser', 'Request APPROVED', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'APPROVED'::"EventStatus", NULL, NULL, '2026-09-03 09:03:00', '2026-09-03 09:03:00'),
  ('e-status-awaiting-clarification', 'u-organiser', 'Request AWAITING_CLARIFICATION', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'AWAITING_CLARIFICATION'::"EventStatus", NULL, NULL, '2026-09-03 09:04:00', '2026-09-03 09:04:00'),
  ('e-status-returned', 'u-organiser', 'Request RETURNED', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'RETURNED'::"EventStatus", NULL, NULL, '2026-09-03 09:05:00', '2026-09-03 09:05:00'),
  ('e-status-rejected', 'u-organiser', 'Request REJECTED', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'REJECTED'::"EventStatus", NULL, NULL, '2026-09-03 09:06:00', '2026-09-03 09:06:00'),
  ('e-status-planning', 'u-organiser', 'Request PLANNING', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'PLANNING'::"EventStatus", NULL, NULL, '2026-09-03 09:07:00', '2026-09-03 09:07:00'),
  ('e-status-awaiting-arrangements', 'u-organiser', 'Request AWAITING_ARRANGEMENTS', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'AWAITING_ARRANGEMENTS'::"EventStatus", NULL, NULL, '2026-09-03 09:08:00', '2026-09-03 09:08:00'),
  ('e-status-confirmed', 'u-organiser', 'Request CONFIRMED', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'CONFIRMED'::"EventStatus", NULL, NULL, '2026-09-03 09:09:00', '2026-09-03 09:09:00'),
  ('e-status-completed', 'u-organiser', 'Request COMPLETED', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'COMPLETED'::"EventStatus", NULL, NULL, '2026-09-03 09:10:00', '2026-09-03 09:10:00'),
  ('e-status-cancelled', 'u-organiser', 'Request CANCELLED', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'CANCELLED'::"EventStatus", NULL, NULL, '2026-09-03 09:11:00', '2026-09-03 09:11:00');
