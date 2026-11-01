-- tc-s3-60c-setup.sql: three unread notices for the Organiser, an hour apart.
--
-- Pre-condition for TC-S3-60 (Story 40 AC-4: the unread count follows marking
-- one, then all). Load AFTER tc-s3-59-setup.sql.
--
--   NTF-012   USR-006 change request rejected, 1 Jan 2030 10:00
--   NTF-013   USR-006 request unfulfillable,   1 Jan 2030 11:00
--   NTF-014   USR-006 "Another update.",        1 Jan 2030 12:00 (newest)

INSERT INTO "Notification" ("id", "recipientId", "type", "message", "relatedEventId", "read", "createdAt") VALUES
  ('NTF-012', 'USR-006', 'EVENT_CHANGE_REQUESTED'::"NotificationType", 'Your change request for "gala" was rejected. Reason: The hall seats 50.', 'EVT-195', false, '2030-01-01 10:00:00'),
  ('NTF-013', 'USR-006', 'EVENT_STATUS_CHANGED'::"NotificationType", 'Your event request "gala" has been rejected because it cannot be fulfilled. Reason: No suitable venue: Every hall is booked.', 'EVT-195', false, '2030-01-01 11:00:00'),
  ('NTF-014', 'USR-006', 'EVENT_STATUS_CHANGED'::"NotificationType", 'Another update.', 'EVT-195', false, '2030-01-01 12:00:00');
