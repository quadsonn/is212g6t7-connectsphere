-- tc-s2-09-setup.sql: on Main Hall on 2 October, one confirmed booking and one
-- pending request at different times, plus an approved event with no booking
-- yet. The test then blocks out the whole day.
--
-- Pre-condition for TC-S2-09 (Story 16 AC-6). Load AFTER base-users.sql and
-- base-venues.sql. All times UTC.
--
--   BKG-012     Main Hall  Oct 2 09:00-12:00  APPROVED   "Gala"
--   BKG-013  Main Hall  Oct 2 13:00-15:00  REQUESTED  "Pending"
--   EVT-025      APPROVED event "New one", assigned to USR-004, no booking
INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-024', 'USR-006', 'USR-004', 'Gala', 'Purpose', 'Description', 'Talk',
     '2030-10-02 09:00:00', '2030-10-02 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-026', 'USR-006', 'USR-004', 'Pending', 'Purpose', 'Description', 'Talk',
     '2030-10-02 09:00:00', '2030-10-02 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-025', 'USR-006', 'USR-004', 'New one', 'Purpose', 'Description', 'Talk',
     '2030-10-02 09:00:00', '2030-10-02 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-012', 'EVT-024', 'VEN-002', '2030-10-02 09:00:00', '2030-10-02 12:00:00',
     'APPROVED'::"BookingStatus", 80, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-013', 'EVT-026', 'VEN-002', '2030-10-02 13:00:00', '2030-10-02 15:00:00',
     'REQUESTED'::"BookingStatus", 80, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
