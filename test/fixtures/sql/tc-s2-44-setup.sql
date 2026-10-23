-- tc-s2-44-setup.sql: requests on two venues, at different dates and in every status, for the filters.
--
-- Pre-condition for TC-S2-44 (and the decided-view check in TC-S2-47) (Story 21 AC-4/AC-7). Load AFTER base-users.sql and base-venues.sql.
-- The test freezes its clock at 2030-09-01 00:00 UTC ("now"), so dates below
-- are fixed: +3 days is 2030-09-04, always inside the 7-day urgency window.
-- Every booking carries THEATRE, HEARING_LOOP ("Two hearing aid users") and
-- "2 wireless mics", requested by USR-004, 80 expected.
--
--   BKG-059            VEN-002      2030-09-21 09:00-12:00  REQUESTED "In hall"  submitted 2030-08-20
--   BKG-060            VEN-038   2030-09-21 09:00-12:00  REQUESTED "In room"  submitted 2030-08-20
--   BKG-061             VEN-002      2030-09-11 09:00-12:00  REQUESTED "Inside"  submitted 2030-08-20
--   BKG-067            VEN-002      2030-10-11 09:00-12:00  REQUESTED "Outside"  submitted 2030-08-20
--   BKG-055       VEN-004        2030-09-21 09:00-12:00  APPROVED  "Approved one"  submitted 2030-08-20
--   BKG-069       VEN-004        2030-09-22 09:00-12:00  REJECTED  "Rejected one"  submitted 2030-08-20

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "preferredLayout", "accessibilityRequirements",
  "accessibilityNotes", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-080', 'USR-006', 'USR-004', 'In hall', 'Purpose', 'Description', 'Talk',
     '2030-09-21 09:00:00', '2030-09-21 12:00:00', 80, 'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[],
     'Two hearing aid users', '2 wireless mics', 'APPROVED'::"EventStatus", '2030-08-01 09:00:00', '2030-08-01 09:00:00'),
  ('EVT-081', 'USR-006', 'USR-004', 'In room', 'Purpose', 'Description', 'Talk',
     '2030-09-21 09:00:00', '2030-09-21 12:00:00', 80, 'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[],
     'Two hearing aid users', '2 wireless mics', 'APPROVED'::"EventStatus", '2030-08-01 09:00:00', '2030-08-01 09:00:00'),
  ('EVT-084', 'USR-006', 'USR-004', 'Inside', 'Purpose', 'Description', 'Talk',
     '2030-09-11 09:00:00', '2030-09-11 12:00:00', 80, 'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[],
     'Two hearing aid users', '2 wireless mics', 'APPROVED'::"EventStatus", '2030-08-01 09:00:00', '2030-08-01 09:00:00'),
  ('EVT-103', 'USR-006', 'USR-004', 'Outside', 'Purpose', 'Description', 'Talk',
     '2030-10-11 09:00:00', '2030-10-11 12:00:00', 80, 'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[],
     'Two hearing aid users', '2 wireless mics', 'APPROVED'::"EventStatus", '2030-08-01 09:00:00', '2030-08-01 09:00:00'),
  ('EVT-057', 'USR-006', 'USR-004', 'Approved one', 'Purpose', 'Description', 'Talk',
     '2030-09-21 09:00:00', '2030-09-21 12:00:00', 80, 'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[],
     'Two hearing aid users', '2 wireless mics', 'APPROVED'::"EventStatus", '2030-08-01 09:00:00', '2030-08-01 09:00:00'),
  ('EVT-114', 'USR-006', 'USR-004', 'Rejected one', 'Purpose', 'Description', 'Talk',
     '2030-09-22 09:00:00', '2030-09-22 12:00:00', 80, 'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[],
     'Two hearing aid users', '2 wireless mics', 'APPROVED'::"EventStatus", '2030-08-01 09:00:00', '2030-08-01 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById",
  "preferredLayout", "accessibilityRequirements", "accessibilityNotes", "equipmentNeeds", "createdAt", "updatedAt") VALUES
  ('BKG-059', 'EVT-080', 'VEN-002', '2030-09-21 09:00:00', '2030-09-21 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'USR-004',
     'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[], 'Two hearing aid users', '2 wireless mics',
     '2030-08-20 09:00:00', '2030-08-20 09:00:00'),
  ('BKG-060', 'EVT-081', 'VEN-038', '2030-09-21 09:00:00', '2030-09-21 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'USR-004',
     'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[], 'Two hearing aid users', '2 wireless mics',
     '2030-08-20 09:00:00', '2030-08-20 09:00:00'),
  ('BKG-061', 'EVT-084', 'VEN-002', '2030-09-11 09:00:00', '2030-09-11 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'USR-004',
     'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[], 'Two hearing aid users', '2 wireless mics',
     '2030-08-20 09:00:00', '2030-08-20 09:00:00'),
  ('BKG-067', 'EVT-103', 'VEN-002', '2030-10-11 09:00:00', '2030-10-11 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'USR-004',
     'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[], 'Two hearing aid users', '2 wireless mics',
     '2030-08-20 09:00:00', '2030-08-20 09:00:00'),
  ('BKG-055', 'EVT-057', 'VEN-004', '2030-09-21 09:00:00', '2030-09-21 12:00:00', 'APPROVED'::"BookingStatus", 80, 'USR-004',
     'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[], 'Two hearing aid users', '2 wireless mics',
     '2030-08-20 09:00:00', '2030-08-20 09:00:00'),
  ('BKG-069', 'EVT-114', 'VEN-004', '2030-09-22 09:00:00', '2030-09-22 12:00:00', 'REJECTED'::"BookingStatus", 80, 'USR-004',
     'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[], 'Two hearing aid users', '2 wireless mics',
     '2030-08-20 09:00:00', '2030-08-20 09:00:00');
