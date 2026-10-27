-- tc-s3-141-setup.sql: an approved booking at a venue that is about to become unavailable, and a venue for its replacement.
--
-- Pre-condition for every test in test/bookings-venue-unavailable.e2e-spec.ts (TC-S3-141 to 145) (Story 52). Load AFTER base-users.sql and tc-s1-96-setup.sql (Vince, USR-013).
-- Times are UTC; the affected booking is 1 Oct 2030 09:00-12:00.
--
--   VEN-073 mainHall (Vera, USR-010) and VEN-074 eastHall (Vince, USR-013): 200, step-free, theatre
--   EVT-266 "showcase" PLANNING, Coordinator USR-004, 80 expected
--   BKG-145 APPROVED mainHall for showcase, with its layout, accessibility and equipment details

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "supportedLayouts", "status", "createdAt", "updatedAt") VALUES
  ('VEN-073', 'mainHall', 'mainHall building', 200, 'USR-010', ARRAY[]::"Facility"[], ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], ARRAY['THEATRE']::"RoomLayout"[], 'PUBLISHED'::"VenueStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('VEN-074', 'eastHall', 'eastHall building', 200, 'USR-013', ARRAY[]::"Facility"[], ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], ARRAY['THEATRE']::"RoomLayout"[], 'PUBLISHED'::"VenueStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "preferredLayout", "accessibilityRequirements", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-266', 'USR-006', 'USR-004', 'showcase', 'p', 'd', 'c', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, 'THEATRE'::"RoomLayout", ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'Edited on the event after booking.', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "preferredLayout", "layoutNotes", "accessibilityRequirements", "accessibilityNotes", "equipmentNeeds", "createdAt", "updatedAt") VALUES
  ('BKG-145', 'EVT-266', 'VEN-073', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 'APPROVED'::"BookingStatus", 80, 'USR-004', 'THEATRE'::"RoomLayout", 'Stage at the front.', ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'Two wheelchair users.', 'Two projectors.', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
