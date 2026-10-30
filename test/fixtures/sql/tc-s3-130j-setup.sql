-- tc-s3-130j-setup.sql: a venue saved without buffers, with the evening booking.
--
-- Pre-condition for the click-through AC-4 test (Story 50). Load AFTER tc-s3-130-setup.sql.
-- Times are UTC on 1 Oct 2030 unless stated.
--
--   VEN-071 unconfigured (60 places, buffer columns left to their default)
--   BKG-132 APPROVED unconfigured 19:00-23:30 for "existing"

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "status", "createdAt", "updatedAt") VALUES
  ('VEN-071', 'unconfigured', 'Campus', 60, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "createdAt", "updatedAt") VALUES
  ('BKG-132', 'EVT-253', 'VEN-071', '2030-10-01 19:00:00', '2030-10-01 23:30:00', 'APPROVED'::"BookingStatus", 50, '2026-09-03 09:00:00', '2026-09-03 09:00:00');
