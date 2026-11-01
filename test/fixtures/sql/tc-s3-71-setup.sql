-- tc-s3-71-setup.sql: Hall A only REQUESTED.
--
-- Pre-condition for TC-S3-71 (checklist: still pending; refused when not ready) (Story 42). Load AFTER tc-s3-70-setup.sql.
--
--   BKG-090   REQUESTED Hall A

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "needsReview", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-090', 'EVT-203', 'VEN-057', '2030-11-01 10:00:00', '2030-11-01 14:00:00', 'REQUESTED'::"BookingStatus", false, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
