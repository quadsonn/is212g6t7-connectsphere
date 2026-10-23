-- tc-s2-23-setup.sql: five venues, each failing exactly one filter except Match.
--
-- Pre-condition for TC-S2-23 (Story 18 AC-5). Load AFTER base-users.sql.
-- Every venue is published, managed by USR-010, located on "Campus".
--
--   Match          capacity 200, PROJECTOR, STEP_FREE_ACCESS, free on the slot
--   TooSmall       as Match but capacity 50
--   NoProjector    as Match but no facilities
--   NotAccessible  as Match but no accessibility features
--   Booked         as Match but APPROVED booking on 10 Mar 2027 09:00-17:00 SGT

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "status", "createdAt", "updatedAt") VALUES
  ('VEN-020', 'Match', 'Campus', 200, 'USR-010', ARRAY['PROJECTOR']::"Facility"[], ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-036', 'TooSmall', 'Campus', 50, 'USR-010', ARRAY['PROJECTOR']::"Facility"[], ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-022', 'NoProjector', 'Campus', 200, 'USR-010', ARRAY[]::"Facility"[], ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-024', 'NotAccessible', 'Campus', 200, 'USR-010', ARRAY['PROJECTOR']::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-013', 'Booked', 'Campus', 200, 'USR-010', ARRAY['PROJECTOR']::"Facility"[], ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-028', 'USR-006', 'USR-004', 'Some event', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 50, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('BKG-027', 'EVT-028', 'VEN-013', '2027-03-10 01:00:00', '2027-03-10 09:00:00', 'APPROVED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
