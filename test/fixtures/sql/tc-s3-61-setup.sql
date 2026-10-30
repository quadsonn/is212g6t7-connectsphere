-- tc-s3-61-setup.sql: five venue notices for one Venue Staff member, a minute
-- apart, m1 the newest.
--
-- Pre-condition for TC-S3-61 (Story 40 AC-5: newest first, a page at a time).
-- Load AFTER base-users.sql.
--
--   NTF-015 to NTF-019   USR-010 "m1" (09:59) to "m5" (09:55), 10 Sep 2026

INSERT INTO "Notification" ("id", "recipientId", "type", "message", "read", "createdAt") VALUES
  ('NTF-015', 'USR-010', 'BOOKING_REQUEST_SUBMITTED'::"NotificationType", 'm5', false, '2026-09-10 09:55:00'),
  ('NTF-016', 'USR-010', 'BOOKING_REQUEST_SUBMITTED'::"NotificationType", 'm1', false, '2026-09-10 09:59:00'),
  ('NTF-017', 'USR-010', 'BOOKING_REQUEST_SUBMITTED'::"NotificationType", 'm4', false, '2026-09-10 09:56:00'),
  ('NTF-018', 'USR-010', 'BOOKING_REQUEST_SUBMITTED'::"NotificationType", 'm2', false, '2026-09-10 09:58:00'),
  ('NTF-019', 'USR-010', 'BOOKING_REQUEST_SUBMITTED'::"NotificationType", 'm3', false, '2026-09-10 09:57:00');
