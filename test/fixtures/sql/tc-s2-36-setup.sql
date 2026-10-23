-- tc-s2-36-setup.sql: a CONFIRMED booking on Main Hall overlapping the 09:00-12:00 slot.
--
-- Pre-condition for TC-S2-36 (Story 20 AC-4). Load AFTER base-users.sql,
-- base-venues.sql and tc-s2-34-setup.sql. All times UTC, 1 Oct 2030.
--
--   EVT-079  APPROVED event "Hackathon"
--   BKG-028  Main Hall  10:00-14:00  APPROVED

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "preferredLayout", "accessibilityRequirements",
  "accessibilityNotes", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-079', 'USR-006', 'USR-004', 'Hackathon', 'Welcome', 'Programme', 'Student engagement',
     '2030-10-01 09:00:00', '2030-10-01 12:00:00', 120, 'THEATRE'::"RoomLayout",
     ARRAY['HEARING_LOOP']::"AccessibilityFeature"[], 'Two hearing aid users', '2 wireless mics',
     'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('BKG-028', 'EVT-079', 'VEN-002', '2030-10-01 10:00:00', '2030-10-01 14:00:00', 'APPROVED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
