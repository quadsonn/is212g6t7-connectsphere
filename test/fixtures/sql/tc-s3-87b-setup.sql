-- tc-s3-87b-setup.sql: Main Hall has 30-minute buffers, and the Gala and "Other" clash within them.
--
-- Pre-condition for TC-S3-87 (a released booking clears its partner's review flag) (Story 44). Load AFTER tc-s3-83-setup.sql.
--
--   VEN-002 setup 30, turnaround 30 minutes
--   BKG-108 APPROVED Gala 10:00-12:00, needsReview;  BKG-109 APPROVED Other 12:30-14:00, needsReview

UPDATE "Venue" SET "setupMinutes" = 30, "turnaroundMinutes" = 30 WHERE "id" = 'VEN-002';

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "needsReview", "needsReviewReason", "holdExpiresAt", "heldById", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-108', 'EVT-194', 'VEN-002', '2030-10-01 10:00:00', '2030-10-01 12:00:00', 'APPROVED'::"BookingStatus", true, 'Clashes under new buffers.', NULL, NULL, 120, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-109', 'EVT-211', 'VEN-002', '2030-10-01 12:30:00', '2030-10-01 14:00:00', 'APPROVED'::"BookingStatus", true, 'Clashes under new buffers.', NULL, NULL, 120, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
