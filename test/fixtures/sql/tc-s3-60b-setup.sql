-- tc-s3-60b-setup.sql: one unread notice for the Organiser (a change request
-- rejected, as US-48 words it).
--
-- Pre-condition for TC-S3-60 (Story 40 AC-4: marking read and unread, and only
-- your own). Load AFTER tc-s3-59-setup.sql.
--
--   NTF-011   USR-006, EVENT_CHANGE_REQUESTED, about EVT-195, unread

INSERT INTO "Notification" ("id", "recipientId", "type", "message", "relatedEventId", "read", "createdAt") VALUES
  ('NTF-011', 'USR-006', 'EVENT_CHANGE_REQUESTED'::"NotificationType", 'Your change request for "gala" was rejected. Reason: The hall seats 50.', 'EVT-195', false, '2026-09-10 10:00:00');
