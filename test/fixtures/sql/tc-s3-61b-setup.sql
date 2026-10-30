-- tc-s3-61b-setup.sql: two notices for the Organiser and one for the
-- Coordinator, an hour apart.
--
-- Pre-condition for TC-S3-61 (Story 40 AC-5: newest first, only your own) and
-- TC-S3-60 (AC-4: mark all touches only your own). Load AFTER
-- tc-s3-59-setup.sql. The texts are the ones US-48, US-52 and US-47 send.
--
--   NTF-020   USR-006 change request rejected (US-48),        1 Jan 2030 10:00
--   NTF-021   USR-004 venue unavailable (US-52),              1 Jan 2030 11:00
--   NTF-022   USR-006 request unfulfillable (US-47), newest,  1 Jan 2030 12:00

INSERT INTO "Notification" ("id", "recipientId", "type", "message", "relatedEventId", "read", "createdAt") VALUES
  ('NTF-020', 'USR-006', 'EVENT_CHANGE_REQUESTED'::"NotificationType", 'Your change request for "gala" was rejected. Reason: The hall seats 50.', 'EVT-195', false, '2030-01-01 10:00:00'),
  ('NTF-021', 'USR-004', 'VENUE_CHANGED_BOOKINGS_AFFECTED'::"NotificationType", 'Main Hall is unavailable from 2030-09-30T00:00:00.000Z to 2030-10-02T00:00:00.000Z, affecting the booking for "gala" on 2030-10-01T01:00:00.000Z – 2030-10-01T05:00:00.000Z. Reason: Flood damage. The event has not been cancelled; request a replacement venue.', 'EVT-195', false, '2030-01-01 11:00:00'),
  ('NTF-022', 'USR-006', 'EVENT_STATUS_CHANGED'::"NotificationType", 'Your event request "gala" has been rejected because it cannot be fulfilled. Reason: No suitable venue: Every hall is booked.', 'EVT-195', false, '2030-01-01 12:00:00');
