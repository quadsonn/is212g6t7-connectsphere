-- tc-s3-55b-setup.sql: a Main Hall request for the Gala, still REQUESTED.
--
-- Pre-condition for TC-S3-55 (Story 40 AC-1: a booking that is not approved
-- is not reported as changed) and TC-S3-57 (AC-1, tentative hold notices).
-- Load AFTER tc-s3-54-setup.sql.
--
--   BKG-080   REQUESTED Main Hall (VEN-002) for EVT-194, 1 Oct 2030 18:00-22:00 UTC, 120

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-080', 'EVT-194', 'VEN-002', '2030-10-01 18:00:00', '2030-10-01 22:00:00', 'REQUESTED'::"BookingStatus", 120, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
