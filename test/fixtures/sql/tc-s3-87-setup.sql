-- tc-s3-87-setup.sql: "Other" has Main Hall approved earlier the same day.
--
-- Pre-condition for TC-S3-87 (other bookings unaffected) (Story 44). Load AFTER tc-s3-83-setup.sql and tc-s3-55-setup.sql.
--
--   BKG-107 APPROVED Main Hall for EVT-211, 08:00-12:00

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "needsReview", "needsReviewReason", "holdExpiresAt", "heldById", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-107', 'EVT-211', 'VEN-002', '2030-10-01 08:00:00', '2030-10-01 12:00:00', 'APPROVED'::"BookingStatus", false, NULL, NULL, NULL, 120, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
