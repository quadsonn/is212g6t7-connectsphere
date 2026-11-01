-- tc-s3-177e-setup.sql: Main Hall approved for the Careers Fair, so it is ready to confirm.
--
-- Pre-condition for every test that starts from an event in the Safety queue
-- (the spec's queuedEvent helper, which then confirms it through the API).
-- Load AFTER tc-s3-177-setup.sql.
--
--   BKG-163 APPROVED Main Hall for EVT-300, 2 Oct 2030 09:00-13:00 UTC

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-163', 'EVT-300', 'VEN-082', '2030-10-02 09:00:00', '2030-10-02 13:00:00', 'APPROVED'::"BookingStatus", 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
