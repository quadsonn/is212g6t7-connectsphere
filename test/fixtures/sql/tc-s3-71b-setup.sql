-- tc-s3-71b-setup.sql: Room 2 APPROVED but flagged "Conflict - needs review".
--
-- Pre-condition for TC-S3-71 (Story 42). Load AFTER tc-s3-70-setup.sql.
--
--   BKG-091   APPROVED Room 2, needsReview

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "needsReview", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-091', 'EVT-203', 'VEN-058', '2030-11-01 10:00:00', '2030-11-01 14:00:00', 'APPROVED'::"BookingStatus", true, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
