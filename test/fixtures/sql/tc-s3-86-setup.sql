-- tc-s3-86-setup.sql: the Gala also has a pending East Annex booking (Sam's venue).
--
-- Pre-condition for TC-S3-86 (each manager told) (Story 44). Load AFTER tc-s3-83-setup.sql and tc-s3-55-setup.sql.
--
--   BKG-106 REQUESTED East Annex (VEN-039) for EVT-194, 18:00-22:00

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "needsReview", "needsReviewReason", "holdExpiresAt", "heldById", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-106', 'EVT-194', 'VEN-039', '2030-10-01 18:00:00', '2030-10-01 22:00:00', 'REQUESTED'::"BookingStatus", false, NULL, NULL, NULL, 120, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
