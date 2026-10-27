-- tc-s3-83d-setup.sql: the Gala's Main Hall booking is approved but flagged "Conflict - needs review".
--
-- Pre-condition for TC-S3-83 (Story 44). Load AFTER tc-s3-83-setup.sql.
--
--   BKG-105 APPROVED Main Hall for EVT-194, 18:00-22:00, needsReview

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "needsReview", "needsReviewReason", "holdExpiresAt", "heldById", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-105', 'EVT-194', 'VEN-002', '2030-10-01 18:00:00', '2030-10-01 22:00:00', 'APPROVED'::"BookingStatus", true, 'Clashes under new buffers.', NULL, NULL, 120, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
