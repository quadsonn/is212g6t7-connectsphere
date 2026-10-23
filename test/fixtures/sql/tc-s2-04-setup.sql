-- tc-s2-04-setup.sql: two confirmed bookings on Main Hall, two and a half
-- weeks apart, so each calendar window can be shown to include or exclude them.
--
-- Pre-condition for TC-S2-04 (Story 16 AC-2). Load AFTER base-users.sql and
-- base-venues.sql. All times UTC.
--
--   BKG-005    Main Hall  Oct 2  09:00-12:00  APPROVED  "Day two"
--   BKG-006  Main Hall  Oct 20 09:00-12:00  APPROVED  "Next week"
INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-017', 'USR-006', 'USR-004', 'Day two', 'Purpose', 'Description', 'Talk',
     '2030-10-02 09:00:00', '2030-10-02 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-018', 'USR-006', 'USR-004', 'Next week', 'Purpose', 'Description', 'Talk',
     '2030-10-20 09:00:00', '2030-10-20 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-005', 'EVT-017', 'VEN-002', '2030-10-02 09:00:00', '2030-10-02 12:00:00',
     'APPROVED'::"BookingStatus", 80, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-006', 'EVT-018', 'VEN-002', '2030-10-20 09:00:00', '2030-10-20 12:00:00',
     'APPROVED'::"BookingStatus", 80, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
