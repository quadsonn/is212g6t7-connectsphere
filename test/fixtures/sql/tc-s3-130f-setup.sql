-- tc-s3-130f-setup.sql: another venue, where "newEvent" has a pending request 12:15-13:00.
--
-- Pre-condition for the US-41 test (TC-S3-131) (Story 50). Load AFTER tc-s3-130-setup.sql.
-- Times are UTC on 1 Oct 2030 unless stated.
--
--   VEN-070 other (no buffers); BKG-129 REQUESTED other for newEvent, 12:15-13:00

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "setupMinutes", "turnaroundMinutes", "status", "createdAt", "updatedAt") VALUES
  ('VEN-070', 'other', 'Campus', 200, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 0, 0, 'PUBLISHED'::"VenueStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "createdAt", "updatedAt") VALUES
  ('BKG-129', 'EVT-254', 'VEN-070', '2030-10-01 12:15:00', '2030-10-01 13:00:00', 'REQUESTED'::"BookingStatus", 50, '2026-09-03 09:00:00', '2026-09-03 09:00:00');
