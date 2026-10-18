-- tc-s2-28-setup.sql: one venue and one event that fits it on every check,
-- plus a draft venue.
--
-- Pre-condition for TC-S2-28 (Story 19 AC-1/2/4), and the base for TC-S2-29,
-- 31, 32 and 33. Load AFTER base-users.sql.
--
--   v-s2-suit-hall   "Hall", PUBLISHED, capacity 100, STEP_FREE_ACCESS, layout THEATRE
--   v-s2-suit-draft  "Draft hall", DRAFT
--   e-s2-fits        APPROVED event assigned to u-coordinator-a: 80 expected,
--                    needs STEP_FREE_ACCESS, prefers THEATRE, 10 Mar 2027 09:00-17:00 SGT

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "supportedLayouts", "status", "createdAt", "updatedAt") VALUES
  ('v-s2-suit-hall', 'Hall', 'Campus', 100, 'u-venue-staff', ARRAY[]::"Facility"[],
     ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], ARRAY['THEATRE']::"RoomLayout"[],
     'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('v-s2-suit-draft', 'Draft hall', NULL, NULL, 'u-venue-staff', ARRAY[]::"Facility"[],
     ARRAY[]::"AccessibilityFeature"[], ARRAY[]::"RoomLayout"[],
     'DRAFT'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "accessibilityRequirements", "preferredLayout",
  "status", "createdAt", "updatedAt") VALUES
  ('e-s2-fits', 'u-organiser', 'u-coordinator-a', 'Fits', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 80, ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'THEATRE'::"RoomLayout",
     'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
