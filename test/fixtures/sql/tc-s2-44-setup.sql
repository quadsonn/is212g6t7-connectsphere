-- tc-s2-44-setup.sql: requests on two venues, at different dates and in every status, for the filters.
--
-- Pre-condition for TC-S2-44 (and the decided-view check in TC-S2-47) (Story 21 AC-4/AC-7). Load AFTER base-users.sql and base-venues.sql.
-- The test freezes its clock at 2030-09-01 00:00 UTC ("now"), so dates below
-- are fixed: +3 days is 2030-09-04, always inside the 7-day urgency window.
-- Every booking carries THEATRE, HEARING_LOOP ("Two hearing aid users") and
-- "2 wireless mics", requested by u-coordinator-a, 80 expected.
--
--   b-s2-in-hall            v-main-hall      2030-09-21 09:00-12:00  REQUESTED "In hall"  submitted 2030-08-20
--   b-s2-in-room            v-seminar-room   2030-09-21 09:00-12:00  REQUESTED "In room"  submitted 2030-08-20
--   b-s2-inside             v-main-hall      2030-09-11 09:00-12:00  REQUESTED "Inside"  submitted 2030-08-20
--   b-s2-outside            v-main-hall      2030-10-11 09:00-12:00  REQUESTED "Outside"  submitted 2030-08-20
--   b-s2-approved-one       v-rooftop        2030-09-21 09:00-12:00  APPROVED  "Approved one"  submitted 2030-08-20
--   b-s2-rejected-one       v-rooftop        2030-09-22 09:00-12:00  REJECTED  "Rejected one"  submitted 2030-08-20

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "preferredLayout", "accessibilityRequirements",
  "accessibilityNotes", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-in-hall', 'u-organiser', 'u-coordinator-a', 'In hall', 'Purpose', 'Description', 'Talk',
     '2030-09-21 09:00:00', '2030-09-21 12:00:00', 80, 'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[],
     'Two hearing aid users', '2 wireless mics', 'APPROVED'::"EventStatus", '2030-08-01 09:00:00', '2030-08-01 09:00:00'),
  ('e-s2-in-room', 'u-organiser', 'u-coordinator-a', 'In room', 'Purpose', 'Description', 'Talk',
     '2030-09-21 09:00:00', '2030-09-21 12:00:00', 80, 'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[],
     'Two hearing aid users', '2 wireless mics', 'APPROVED'::"EventStatus", '2030-08-01 09:00:00', '2030-08-01 09:00:00'),
  ('e-s2-inside', 'u-organiser', 'u-coordinator-a', 'Inside', 'Purpose', 'Description', 'Talk',
     '2030-09-11 09:00:00', '2030-09-11 12:00:00', 80, 'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[],
     'Two hearing aid users', '2 wireless mics', 'APPROVED'::"EventStatus", '2030-08-01 09:00:00', '2030-08-01 09:00:00'),
  ('e-s2-outside', 'u-organiser', 'u-coordinator-a', 'Outside', 'Purpose', 'Description', 'Talk',
     '2030-10-11 09:00:00', '2030-10-11 12:00:00', 80, 'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[],
     'Two hearing aid users', '2 wireless mics', 'APPROVED'::"EventStatus", '2030-08-01 09:00:00', '2030-08-01 09:00:00'),
  ('e-s2-approved-one', 'u-organiser', 'u-coordinator-a', 'Approved one', 'Purpose', 'Description', 'Talk',
     '2030-09-21 09:00:00', '2030-09-21 12:00:00', 80, 'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[],
     'Two hearing aid users', '2 wireless mics', 'APPROVED'::"EventStatus", '2030-08-01 09:00:00', '2030-08-01 09:00:00'),
  ('e-s2-rejected-one', 'u-organiser', 'u-coordinator-a', 'Rejected one', 'Purpose', 'Description', 'Talk',
     '2030-09-22 09:00:00', '2030-09-22 12:00:00', 80, 'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[],
     'Two hearing aid users', '2 wireless mics', 'APPROVED'::"EventStatus", '2030-08-01 09:00:00', '2030-08-01 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById",
  "preferredLayout", "accessibilityRequirements", "accessibilityNotes", "equipmentNeeds", "createdAt", "updatedAt") VALUES
  ('b-s2-in-hall', 'e-s2-in-hall', 'v-main-hall', '2030-09-21 09:00:00', '2030-09-21 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'u-coordinator-a',
     'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[], 'Two hearing aid users', '2 wireless mics',
     '2030-08-20 09:00:00', '2030-08-20 09:00:00'),
  ('b-s2-in-room', 'e-s2-in-room', 'v-seminar-room', '2030-09-21 09:00:00', '2030-09-21 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'u-coordinator-a',
     'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[], 'Two hearing aid users', '2 wireless mics',
     '2030-08-20 09:00:00', '2030-08-20 09:00:00'),
  ('b-s2-inside', 'e-s2-inside', 'v-main-hall', '2030-09-11 09:00:00', '2030-09-11 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'u-coordinator-a',
     'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[], 'Two hearing aid users', '2 wireless mics',
     '2030-08-20 09:00:00', '2030-08-20 09:00:00'),
  ('b-s2-outside', 'e-s2-outside', 'v-main-hall', '2030-10-11 09:00:00', '2030-10-11 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'u-coordinator-a',
     'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[], 'Two hearing aid users', '2 wireless mics',
     '2030-08-20 09:00:00', '2030-08-20 09:00:00'),
  ('b-s2-approved-one', 'e-s2-approved-one', 'v-rooftop', '2030-09-21 09:00:00', '2030-09-21 12:00:00', 'APPROVED'::"BookingStatus", 80, 'u-coordinator-a',
     'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[], 'Two hearing aid users', '2 wireless mics',
     '2030-08-20 09:00:00', '2030-08-20 09:00:00'),
  ('b-s2-rejected-one', 'e-s2-rejected-one', 'v-rooftop', '2030-09-22 09:00:00', '2030-09-22 12:00:00', 'REJECTED'::"BookingStatus", 80, 'u-coordinator-a',
     'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[], 'Two hearing aid users', '2 wireless mics',
     '2030-08-20 09:00:00', '2030-08-20 09:00:00');
