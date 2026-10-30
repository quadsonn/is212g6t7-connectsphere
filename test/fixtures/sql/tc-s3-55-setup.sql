-- tc-s3-55-setup.sql: Main Hall APPROVED for the Gala.
--
-- Pre-condition for TC-S3-55 (Story 40 AC-1, an approved booking changes),
-- TC-S3-56 (AC-1, the event is cancelled) and TC-S3-62 (AC-6). Load AFTER
-- tc-s3-54-setup.sql.
--
--   BKG-079   APPROVED Main Hall (VEN-002) for EVT-194, 1 Oct 2030 18:00-22:00 UTC, 120

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-079', 'EVT-194', 'VEN-002', '2030-10-01 18:00:00', '2030-10-01 22:00:00', 'APPROVED'::"BookingStatus", 120, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
