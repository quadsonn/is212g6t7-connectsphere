-- base-venues.sql — a small venue catalogue for Sprint 1 integration tests.
--
-- Load AFTER base-users.sql: every venue is managed by u-venue-staff.
-- Inserts only; reset first. See README.md.

-- Three published venues (they satisfy Venue_complete_unless_draft: name,
-- location and capacity set) and one draft, all managed by u-venue-staff.
INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "supportedLayouts", "operatingInfo", "status", "createdAt", "updatedAt") VALUES
  ('v-main-hall',    'Main Hall',    'Block A, Level 1', 300, 'u-venue-staff',
     ARRAY['PROJECTOR', 'SOUND_SYSTEM', 'STAGE']::"Facility"[],
     ARRAY['STEP_FREE_ACCESS', 'HEARING_LOOP']::"AccessibilityFeature"[],
     ARRAY['THEATRE', 'BANQUET']::"RoomLayout"[],
     '8:00 AM – 10:00 PM', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('v-seminar-room', 'Seminar Room', 'Block B, Level 3',  40, 'u-venue-staff',
     ARRAY['PROJECTOR', 'WHITEBOARD', 'WIFI']::"Facility"[],
     ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[],
     ARRAY['CLASSROOM', 'BOARDROOM', 'U_SHAPE']::"RoomLayout"[],
     '8:00 AM – 6:00 PM', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('v-rooftop',      'Rooftop Terrace', 'Block C, Roof', 120, 'u-venue-staff',
     ARRAY['SOUND_SYSTEM']::"Facility"[],
     ARRAY[]::"AccessibilityFeature"[],
     ARRAY['EVENT_HALL']::"RoomLayout"[],
     '6:00 PM – 11:30 PM', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('v-draft-annex',  'Annex (draft)', NULL, NULL, 'u-venue-staff',
     ARRAY[]::"Facility"[],
     ARRAY[]::"AccessibilityFeature"[],
     ARRAY[]::"RoomLayout"[],
     NULL, 'DRAFT'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
