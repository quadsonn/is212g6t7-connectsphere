-- tc-s3-67-setup.sql: the Coordinator's notice that a booking was rejected
-- with a suggested alternative, as US-41 words it.
--
-- Pre-condition for TC-S3-67 (Story 41 AC-5: the Coordinator sees the
-- suggestions with the reason). Load AFTER tc-s3-59-setup.sql.
--
--   NTF-023   USR-004, VENUE_BOOKING_DECIDED, about EVT-195, unread

INSERT INTO "Notification" ("id", "recipientId", "type", "message", "relatedEventId", "read", "createdAt") VALUES
  ('NTF-023', 'USR-004', 'VENUE_BOOKING_DECIDED'::"NotificationType", 'the booking of Main Hall for "gala" was rejected. Reason: Closed for repairs. Alternative venues suggested: East Hall.', 'EVT-195', false, '2026-09-10 10:00:00');
