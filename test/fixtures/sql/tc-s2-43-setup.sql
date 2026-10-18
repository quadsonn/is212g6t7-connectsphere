-- tc-s2-43-setup.sql: two pending requests whose event order and submission order are opposite, so each sort is distinguishable.
--
-- Pre-condition for TC-S2-43 (Story 21 AC-3). Load AFTER base-users.sql and base-venues.sql.
-- The test freezes its clock at 2030-09-01 00:00 UTC ("now"), so dates below
-- are fixed: +3 days is 2030-09-04, always inside the 7-day urgency window.
-- Every booking carries THEATRE, HEARING_LOOP ("Two hearing aid users") and
-- "2 wireless mics", requested by u-coordinator-a, 80 expected.
--
--   b-s2-later              v-main-hall      2030-10-01 09:00-12:00  REQUESTED "Later"  submitted 2030-08-20
--   b-s2-sooner             v-main-hall      2030-09-16 09:00-12:00  REQUESTED "Sooner"  submitted 2030-08-21

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "preferredLayout", "accessibilityRequirements",
  "accessibilityNotes", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-later', 'u-organiser', 'u-coordinator-a', 'Later', 'Purpose', 'Description', 'Talk',
     '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, 'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[],
     'Two hearing aid users', '2 wireless mics', 'APPROVED'::"EventStatus", '2030-08-01 09:00:00', '2030-08-01 09:00:00'),
  ('e-s2-sooner', 'u-organiser', 'u-coordinator-a', 'Sooner', 'Purpose', 'Description', 'Talk',
     '2030-09-16 09:00:00', '2030-09-16 12:00:00', 80, 'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[],
     'Two hearing aid users', '2 wireless mics', 'APPROVED'::"EventStatus", '2030-08-01 09:00:00', '2030-08-01 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById",
  "preferredLayout", "accessibilityRequirements", "accessibilityNotes", "equipmentNeeds", "createdAt", "updatedAt") VALUES
  ('b-s2-later', 'e-s2-later', 'v-main-hall', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'u-coordinator-a',
     'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[], 'Two hearing aid users', '2 wireless mics',
     '2030-08-20 09:00:00', '2030-08-20 09:00:00'),
  ('b-s2-sooner', 'e-s2-sooner', 'v-main-hall', '2030-09-16 09:00:00', '2030-09-16 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'u-coordinator-a',
     'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[], 'Two hearing aid users', '2 wireless mics',
     '2030-08-21 09:00:00', '2030-08-21 09:00:00');
