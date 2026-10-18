-- tc-s2-45-setup.sql: pending requests far away, near (3 days), and already started (-1 day).
--
-- Pre-condition for TC-S2-45 (Story 21 AC-5). Load AFTER base-users.sql and base-venues.sql.
-- The test freezes its clock at 2030-09-01 00:00 UTC ("now"), so dates below
-- are fixed: +3 days is 2030-09-04, always inside the 7-day urgency window.
-- Every booking carries THEATRE, HEARING_LOOP ("Two hearing aid users") and
-- "2 wireless mics", requested by u-coordinator-a, 80 expected.
--
--   b-s2-overdue            v-main-hall      2030-08-31 09:00-12:00  REQUESTED "Overdue"  submitted 2030-08-19
--   b-s2-far                v-main-hall      2030-10-01 09:00-12:00  REQUESTED "Far"  submitted 2030-08-20
--   b-s2-near               v-seminar-room   2030-09-04 09:00-12:00  REQUESTED "Near"  submitted 2030-08-21

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "preferredLayout", "accessibilityRequirements",
  "accessibilityNotes", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-overdue', 'u-organiser', 'u-coordinator-a', 'Overdue', 'Purpose', 'Description', 'Talk',
     '2030-08-31 09:00:00', '2030-08-31 12:00:00', 80, 'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[],
     'Two hearing aid users', '2 wireless mics', 'APPROVED'::"EventStatus", '2030-08-01 09:00:00', '2030-08-01 09:00:00'),
  ('e-s2-far', 'u-organiser', 'u-coordinator-a', 'Far', 'Purpose', 'Description', 'Talk',
     '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, 'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[],
     'Two hearing aid users', '2 wireless mics', 'APPROVED'::"EventStatus", '2030-08-01 09:00:00', '2030-08-01 09:00:00'),
  ('e-s2-near', 'u-organiser', 'u-coordinator-a', 'Near', 'Purpose', 'Description', 'Talk',
     '2030-09-04 09:00:00', '2030-09-04 12:00:00', 80, 'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[],
     'Two hearing aid users', '2 wireless mics', 'APPROVED'::"EventStatus", '2030-08-01 09:00:00', '2030-08-01 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById",
  "preferredLayout", "accessibilityRequirements", "accessibilityNotes", "equipmentNeeds", "createdAt", "updatedAt") VALUES
  ('b-s2-overdue', 'e-s2-overdue', 'v-main-hall', '2030-08-31 09:00:00', '2030-08-31 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'u-coordinator-a',
     'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[], 'Two hearing aid users', '2 wireless mics',
     '2030-08-19 09:00:00', '2030-08-19 09:00:00'),
  ('b-s2-far', 'e-s2-far', 'v-main-hall', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'u-coordinator-a',
     'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[], 'Two hearing aid users', '2 wireless mics',
     '2030-08-20 09:00:00', '2030-08-20 09:00:00'),
  ('b-s2-near', 'e-s2-near', 'v-seminar-room', '2030-09-04 09:00:00', '2030-09-04 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'u-coordinator-a',
     'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[], 'Two hearing aid users', '2 wireless mics',
     '2030-08-21 09:00:00', '2030-08-21 09:00:00');
