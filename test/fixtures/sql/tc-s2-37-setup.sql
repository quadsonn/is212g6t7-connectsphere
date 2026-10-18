-- tc-s2-37-setup.sql: a CONFIRMED booking on Main Hall starting exactly when the 09:00-12:00 slot ends.
--
-- Pre-condition for TC-S2-37 (Story 20 AC-4). Load AFTER base-users.sql,
-- base-venues.sql and tc-s2-34-setup.sql. All times UTC, 1 Oct 2030.
--
--   e-s2-hackathon  APPROVED event "Hackathon"
--   b-s2-37-back-to-back  Main Hall  12:00-14:00  APPROVED

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "preferredLayout", "accessibilityRequirements",
  "accessibilityNotes", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-hackathon', 'u-organiser', 'u-coordinator-a', 'Hackathon', 'Welcome', 'Programme', 'Student engagement',
     '2030-10-01 09:00:00', '2030-10-01 12:00:00', 120, 'THEATRE'::"RoomLayout",
     ARRAY['HEARING_LOOP']::"AccessibilityFeature"[], 'Two hearing aid users', '2 wireless mics',
     'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('b-s2-37-back-to-back', 'e-s2-hackathon', 'v-main-hall', '2030-10-01 12:00:00', '2030-10-01 14:00:00', 'APPROVED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
