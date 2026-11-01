-- tc-s3-70d-setup.sql: Room 2 also APPROVED, and a rejected Annex booking that no longer counts.
--
-- Pre-condition for TC-S3-70 (every venue approved) (Story 42). Load AFTER tc-s3-70b-setup.sql.
--
--   BKG-093   APPROVED Room 2
--   BKG-094   REJECTED Annex

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "needsReview", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-093', 'EVT-203', 'VEN-058', '2030-11-01 10:00:00', '2030-11-01 14:00:00', 'APPROVED'::"BookingStatus", false, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-094', 'EVT-203', 'VEN-059', '2030-11-01 10:00:00', '2030-11-01 14:00:00', 'REJECTED'::"BookingStatus", false, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
