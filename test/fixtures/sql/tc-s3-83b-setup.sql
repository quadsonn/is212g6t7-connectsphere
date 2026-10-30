-- tc-s3-83b-setup.sql: the Gala has a pending, a held, a confirmed and a rejected Main Hall booking.
--
-- Pre-condition for TC-S3-83 and TC-S3-85 (Story 44). Load AFTER tc-s3-83-setup.sql.
--
--   BKG-100 REQUESTED 09:00-10:00, BKG-101 HELD 11:00-12:00 (expires 29 Sep 2030),
--   BKG-102 APPROVED 18:00-22:00, BKG-103 REJECTED 13:00-14:00

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "needsReview", "needsReviewReason", "holdExpiresAt", "heldById", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-100', 'EVT-194', 'VEN-002', '2030-10-01 09:00:00', '2030-10-01 10:00:00', 'REQUESTED'::"BookingStatus", false, NULL, NULL, NULL, 120, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-101', 'EVT-194', 'VEN-002', '2030-10-01 11:00:00', '2030-10-01 12:00:00', 'HELD'::"BookingStatus", false, NULL, '2030-09-29 00:00:00', 'USR-010', 120, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-102', 'EVT-194', 'VEN-002', '2030-10-01 18:00:00', '2030-10-01 22:00:00', 'APPROVED'::"BookingStatus", false, NULL, NULL, NULL, 120, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-103', 'EVT-194', 'VEN-002', '2030-10-01 13:00:00', '2030-10-01 14:00:00', 'REJECTED'::"BookingStatus", false, NULL, NULL, NULL, 120, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
