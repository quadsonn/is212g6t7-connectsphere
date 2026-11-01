-- tc-s3-59b-setup.sql: one notice about the gala for each of seven roles.
--
-- Pre-condition for TC-S3-59 (Story 40 AC-3: each role's notice links to its
-- own page for the event). Load AFTER tc-s3-59-setup.sql.
--
--   NTF-001 to NTF-007   "Something happened." about EVT-195, to the Organiser
--                        (USR-006), Coordinator (USR-004), Venue Staff (USR-010),
--                        Technical Support (USR-009), Attendee (USR-001),
--                        Lead (USR-012) and Safety Officer (USR-017)

INSERT INTO "Notification" ("id", "recipientId", "type", "message", "relatedEventId", "read", "createdAt") VALUES
  ('NTF-001', 'USR-006', 'EVENT_STATUS_CHANGED'::"NotificationType", 'Something happened.', 'EVT-195', false, '2026-09-10 10:00:00'),
  ('NTF-002', 'USR-004', 'EVENT_STATUS_CHANGED'::"NotificationType", 'Something happened.', 'EVT-195', false, '2026-09-10 10:00:00'),
  ('NTF-003', 'USR-010', 'EVENT_STATUS_CHANGED'::"NotificationType", 'Something happened.', 'EVT-195', false, '2026-09-10 10:00:00'),
  ('NTF-004', 'USR-009', 'EVENT_STATUS_CHANGED'::"NotificationType", 'Something happened.', 'EVT-195', false, '2026-09-10 10:00:00'),
  ('NTF-005', 'USR-001', 'EVENT_STATUS_CHANGED'::"NotificationType", 'Something happened.', 'EVT-195', false, '2026-09-10 10:00:00'),
  ('NTF-006', 'USR-012', 'EVENT_STATUS_CHANGED'::"NotificationType", 'Something happened.', 'EVT-195', false, '2026-09-10 10:00:00'),
  ('NTF-007', 'USR-017', 'EVENT_STATUS_CHANGED'::"NotificationType", 'Something happened.', 'EVT-195', false, '2026-09-10 10:00:00');
