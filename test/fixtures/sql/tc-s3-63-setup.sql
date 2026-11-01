-- tc-s3-63-setup.sql: a booking request for Main Hall that Venue Staff are deciding,
-- and one good alternative venue.
--
-- Pre-condition for every test in test/bookings-suggestions.e2e-spec.ts
-- (Story 41, TC-S3-63 to 69). Load AFTER base-users.sql only: it brings its
-- own venues, so the alternatives lists contain nothing else.
--
--   USR-018   VENUE_STAFF "Olly Other" (other.staff@example.com)
--   VEN-041   mainHall, capacity 200, no accessibility features, managed by USR-010
--   VEN-042   eastHall, capacity 100, step-free, theatre, managed by USR-018
--   EVT-196   PLANNING "Showcase", USR-006 / USR-004, 1 Oct 2030 09:00-12:00 UTC,
--             80 expected, theatre, step-free
--   BKG-082   REQUESTED mainHall for the Showcase, 80, theatre, "Stage at the front.",
--             step-free, "Two wheelchair users.", "Two projectors."

INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "createdAt", "updatedAt") VALUES
  ('USR-018', 'other.staff@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Olly Other', 'VENUE_STAFF'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "supportedLayouts", "turnaroundMinutes", "status", "createdAt", "updatedAt") VALUES
  ('VEN-041', 'mainHall', 'mainHall building', 200, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], ARRAY[]::"RoomLayout"[], 0, 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-042', 'eastHall', 'eastHall building', 100, 'USR-018', ARRAY[]::"Facility"[], ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], ARRAY['THEATRE']::"RoomLayout"[], 0, 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "preferredLayout", "accessibilityRequirements", "equipmentNeeds",
  "status", "createdAt", "updatedAt") VALUES
  ('EVT-196', 'USR-006', 'USR-004', 'Showcase', 'p', 'd', 'c', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80,
     'THEATRE'::"RoomLayout", ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'Event-level needs, edited after the request.',
     'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById",
  "preferredLayout", "layoutNotes", "accessibilityRequirements", "accessibilityNotes", "equipmentNeeds", "createdAt", "updatedAt") VALUES
  ('BKG-082', 'EVT-196', 'VEN-041', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'USR-004',
     'THEATRE'::"RoomLayout", 'Stage at the front.', ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'Two wheelchair users.',
     'Two projectors.', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
