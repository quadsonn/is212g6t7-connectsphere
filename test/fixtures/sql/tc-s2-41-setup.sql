-- tc-s2-41-setup.sql: a pending and an approved request on my venue, and a pending one on another staff member's.
--
-- Pre-condition for TC-S2-41 (Story 21 AC-1). Load AFTER base-users.sql, base-venues.sql and tc-s2-01-setup.sql.
-- The test freezes its clock at 2030-09-01 00:00 UTC ("now"), so dates below
-- are fixed: +3 days is 2030-09-04, always inside the 7-day urgency window.
-- Every booking carries THEATRE, HEARING_LOOP ("Two hearing aid users") and
-- "2 wireless mics", requested by USR-004, 80 expected.
--
--   BKG-064       VEN-002      2030-09-21 09:00-12:00  REQUESTED "Mine pending"  submitted 2030-08-20
--   BKG-063      VEN-002      2030-09-22 09:00-12:00  APPROVED  "Mine approved"  submitted 2030-08-20
--   BKG-066           VEN-003     2030-09-21 09:00-12:00  REQUESTED "Not mine"  submitted 2030-08-20

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "preferredLayout", "accessibilityRequirements",
  "accessibilityNotes", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-090', 'USR-006', 'USR-004', 'Mine pending', 'Purpose', 'Description', 'Talk',
     '2030-09-21 09:00:00', '2030-09-21 12:00:00', 80, 'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[],
     'Two hearing aid users', '2 wireless mics', 'APPROVED'::"EventStatus", '2030-08-01 09:00:00', '2030-08-01 09:00:00'),
  ('EVT-089', 'USR-006', 'USR-004', 'Mine approved', 'Purpose', 'Description', 'Talk',
     '2030-09-22 09:00:00', '2030-09-22 12:00:00', 80, 'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[],
     'Two hearing aid users', '2 wireless mics', 'APPROVED'::"EventStatus", '2030-08-01 09:00:00', '2030-08-01 09:00:00'),
  ('EVT-100', 'USR-006', 'USR-004', 'Not mine', 'Purpose', 'Description', 'Talk',
     '2030-09-21 09:00:00', '2030-09-21 12:00:00', 80, 'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[],
     'Two hearing aid users', '2 wireless mics', 'APPROVED'::"EventStatus", '2030-08-01 09:00:00', '2030-08-01 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById",
  "preferredLayout", "accessibilityRequirements", "accessibilityNotes", "equipmentNeeds", "createdAt", "updatedAt") VALUES
  ('BKG-064', 'EVT-090', 'VEN-002', '2030-09-21 09:00:00', '2030-09-21 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'USR-004',
     'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[], 'Two hearing aid users', '2 wireless mics',
     '2030-08-20 09:00:00', '2030-08-20 09:00:00'),
  ('BKG-063', 'EVT-089', 'VEN-002', '2030-09-22 09:00:00', '2030-09-22 12:00:00', 'APPROVED'::"BookingStatus", 80, 'USR-004',
     'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[], 'Two hearing aid users', '2 wireless mics',
     '2030-08-20 09:00:00', '2030-08-20 09:00:00'),
  ('BKG-066', 'EVT-100', 'VEN-003', '2030-09-21 09:00:00', '2030-09-21 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'USR-004',
     'THEATRE'::"RoomLayout", ARRAY['HEARING_LOOP']::"AccessibilityFeature"[], 'Two hearing aid users', '2 wireless mics',
     '2030-08-20 09:00:00', '2030-08-20 09:00:00');
