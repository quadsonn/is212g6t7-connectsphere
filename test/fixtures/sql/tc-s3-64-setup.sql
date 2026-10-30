-- tc-s3-64-setup.sql: a venue catalogue where only some venues fit the Showcase.
--
-- Pre-condition for TC-S3-64 (Story 41 AC-2: candidates ranked), TC-S3-65
-- (AC-3: a manual choice, refused venues) and the capacity tests in the same
-- file. Load AFTER tc-s3-63-setup.sql. The Showcase needs 80 places, theatre,
-- step-free, 1 Oct 2030 09:00-12:00 UTC.
--
--   Fit, and free:   VEN-044 bigHall (500, step-free, theatre)
--                    VEN-045 flatHall (90, step-free, no theatre)
--                    VEN-051 pendingHall (300, step-free, theatre; only a REQUESTED booking overlaps)
--   Not proposed:    VEN-046 tinyRoom (20)            VEN-047 stairsHall (200, no step-free)
--                    VEN-048 bookedHall (APPROVED booking 10:00-11:00)
--                    VEN-049 blockedHall (blocked 11:00-15:00)
--                    VEN-050 draftHall (DRAFT)        VEN-052 seminarRoom (40)
--                    VEN-053 exactRoom (80, no step-free: offered as a manual choice)
--                    VEN-054 alumniLounge (40)
--                    VEN-055 turnaroundHall (60-minute turnaround after a booking ending 08:30)
--   EVT-197 / BKG-083   "Other at bookedHall", APPROVED 10:00-11:00
--   EVT-198 / BKG-084   "Other at pendingHall", REQUESTED 10:00-11:00
--   EVT-199 / BKG-085   "Morning", APPROVED turnaroundHall 07:00-08:30
--   BLK-005             blockedHall 11:00-15:00, "Maintenance", by USR-010

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "supportedLayouts", "turnaroundMinutes", "status", "createdAt", "updatedAt") VALUES
  ('VEN-044', 'bigHall', 'bigHall building', 500, 'USR-010', ARRAY[]::"Facility"[], ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], ARRAY['THEATRE']::"RoomLayout"[], 0, 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-045', 'flatHall', 'flatHall building', 90, 'USR-010', ARRAY[]::"Facility"[], ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], ARRAY[]::"RoomLayout"[], 0, 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-046', 'tinyRoom', 'tinyRoom building', 20, 'USR-010', ARRAY[]::"Facility"[], ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], ARRAY[]::"RoomLayout"[], 0, 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-047', 'stairsHall', 'stairsHall building', 200, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], ARRAY[]::"RoomLayout"[], 0, 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-048', 'bookedHall', 'bookedHall building', 200, 'USR-010', ARRAY[]::"Facility"[], ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], ARRAY[]::"RoomLayout"[], 0, 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-049', 'blockedHall', 'blockedHall building', 200, 'USR-010', ARRAY[]::"Facility"[], ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], ARRAY[]::"RoomLayout"[], 0, 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-050', 'draftHall', 'draftHall building', 200, 'USR-010', ARRAY[]::"Facility"[], ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], ARRAY[]::"RoomLayout"[], 0, 'DRAFT'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-051', 'pendingHall', 'pendingHall building', 300, 'USR-010', ARRAY[]::"Facility"[], ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], ARRAY['THEATRE']::"RoomLayout"[], 0, 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-052', 'seminarRoom', 'seminarRoom building', 40, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], ARRAY[]::"RoomLayout"[], 0, 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-053', 'exactRoom', 'exactRoom building', 80, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], ARRAY[]::"RoomLayout"[], 0, 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-054', 'alumniLounge', 'alumniLounge building', 40, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], ARRAY[]::"RoomLayout"[], 0, 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-055', 'turnaroundHall', 'turnaroundHall building', 200, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], ARRAY[]::"RoomLayout"[], 60, 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-197', 'USR-006', 'USR-004', 'Other at bookedHall', 'p', 'd', 'c', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-198', 'USR-006', 'USR-004', 'Other at pendingHall', 'p', 'd', 'c', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-199', 'USR-006', 'USR-004', 'Morning', 'p', 'd', 'c', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "createdAt", "updatedAt") VALUES
  ('BKG-083', 'EVT-197', 'VEN-048', '2030-10-01 10:00:00', '2030-10-01 11:00:00', 'APPROVED'::"BookingStatus", 10, '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-084', 'EVT-198', 'VEN-051', '2030-10-01 10:00:00', '2030-10-01 11:00:00', 'REQUESTED'::"BookingStatus", 10, '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-085', 'EVT-199', 'VEN-055', '2030-10-01 07:00:00', '2030-10-01 08:30:00', 'APPROVED'::"BookingStatus", 10, '2026-09-03 09:00:00', '2026-09-03 09:00:00');

INSERT INTO "VenueBlock" ("id", "venueId", "start", "end", "reason", "createdById", "createdAt") VALUES
  ('BLK-005', 'VEN-049', '2030-10-01 11:00:00', '2030-10-01 15:00:00', 'Maintenance', 'USR-010', '2026-09-03 09:00:00');
