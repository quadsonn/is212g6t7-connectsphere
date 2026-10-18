-- tc-s2-23-setup.sql: five venues, each failing exactly one filter except Match.
--
-- Pre-condition for TC-S2-23 (Story 18 AC-5). Load AFTER base-users.sql.
-- Every venue is published, managed by u-venue-staff, located on "Campus".
--
--   Match          capacity 200, PROJECTOR, STEP_FREE_ACCESS, free on the slot
--   TooSmall       as Match but capacity 50
--   NoProjector    as Match but no facilities
--   NotAccessible  as Match but no accessibility features
--   Booked         as Match but APPROVED booking on 10 Mar 2027 09:00-17:00 SGT

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "status", "createdAt", "updatedAt") VALUES
  ('v-s2-match', 'Match', 'Campus', 200, 'u-venue-staff', ARRAY['PROJECTOR']::"Facility"[], ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('v-s2-too-small', 'TooSmall', 'Campus', 50, 'u-venue-staff', ARRAY['PROJECTOR']::"Facility"[], ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('v-s2-no-projector', 'NoProjector', 'Campus', 200, 'u-venue-staff', ARRAY[]::"Facility"[], ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('v-s2-not-accessible', 'NotAccessible', 'Campus', 200, 'u-venue-staff', ARRAY['PROJECTOR']::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('v-s2-booked', 'Booked', 'Campus', 200, 'u-venue-staff', ARRAY['PROJECTOR']::"Facility"[], ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-23', 'u-organiser', 'u-coordinator-a', 'Some event', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 50, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('b-s2-23-booked', 'e-s2-23', 'v-s2-booked', '2027-03-10 01:00:00', '2027-03-10 09:00:00', 'APPROVED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
