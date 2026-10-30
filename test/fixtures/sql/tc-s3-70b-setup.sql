-- tc-s3-70b-setup.sql: Hall A APPROVED for the Graduation showcase.
--
-- Pre-condition for TC-S3-70, 71, 72, 73, 74 (Story 42). Load AFTER tc-s3-70-setup.sql.
--
--   BKG-089   APPROVED Hall A

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "needsReview", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-089', 'EVT-203', 'VEN-057', '2030-11-01 10:00:00', '2030-11-01 14:00:00', 'APPROVED'::"BookingStatus", false, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
