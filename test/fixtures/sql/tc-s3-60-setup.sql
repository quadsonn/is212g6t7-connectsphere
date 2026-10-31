-- tc-s3-60-setup.sql: unread venue notices for two Venue Staff members.
--
-- Pre-condition for TC-S3-60 (Story 40 AC-4: unread count, mark one, mark
-- all). Load AFTER tc-s3-54-setup.sql.
--
--   NTF-008   USR-010 "m3", unread, 10 Sep 2026 09:57
--   NTF-009   USR-010 "m2", unread, 10 Sep 2026 09:58
--   NTF-010   USR-016 "m1", unread, 10 Sep 2026 09:59

INSERT INTO "Notification" ("id", "recipientId", "type", "message", "read", "createdAt") VALUES
  ('NTF-008', 'USR-010', 'BOOKING_REQUEST_SUBMITTED'::"NotificationType", 'm3', false, '2026-09-10 09:57:00'),
  ('NTF-009', 'USR-010', 'BOOKING_REQUEST_SUBMITTED'::"NotificationType", 'm2', false, '2026-09-10 09:58:00'),
  ('NTF-010', 'USR-016', 'BOOKING_REQUEST_SUBMITTED'::"NotificationType", 'm1', false, '2026-09-10 09:59:00');
