-- tc-s3-83c-setup.sql: "Other" has a pending Main Hall booking.
--
-- Pre-condition for TC-S3-85 (who the release is recorded against) (Story 44). Load AFTER tc-s3-83-setup.sql.
--
--   BKG-104 REQUESTED Main Hall for EVT-211, 09:00-10:00

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "needsReview", "needsReviewReason", "holdExpiresAt", "heldById", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-104', 'EVT-211', 'VEN-002', '2030-10-01 09:00:00', '2030-10-01 10:00:00', 'REQUESTED'::"BookingStatus", false, NULL, NULL, NULL, 120, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
