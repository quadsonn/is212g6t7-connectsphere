-- tc-s3-70c-setup.sql: a second venue, Room 2, still REQUESTED.
--
-- Pre-condition for TC-S3-70 (two venues, one pending) (Story 42). Load AFTER tc-s3-70b-setup.sql.
--
--   BKG-092   REQUESTED Room 2

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "needsReview", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-092', 'EVT-203', 'VEN-058', '2030-11-01 10:00:00', '2030-11-01 14:00:00', 'REQUESTED'::"BookingStatus", false, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
