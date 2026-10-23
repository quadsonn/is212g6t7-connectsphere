-- tc-s2-05-setup.sql: one confirmed booking on each of two of USR-010's
-- venues, and one on another staff member's venue, all on the same day.
--
-- Pre-condition for TC-S2-05 (Story 16 AC-3). Load AFTER base-users.sql,
-- base-venues.sql and tc-s2-01-setup.sql. All times UTC.
--
--   BKG-007      Main Hall     Oct 2 09:00-12:00  APPROVED  "Hall event"
--   BKG-009      Seminar Room  Oct 2 09:00-12:00  APPROVED  "Room event"
--   BKG-008  Other Hall    Oct 2 09:00-12:00  APPROVED  "Not mine"
INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-019', 'USR-006', 'USR-004', 'Hall event', 'Purpose', 'Description', 'Talk',
     '2030-10-02 09:00:00', '2030-10-02 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-021', 'USR-006', 'USR-004', 'Room event', 'Purpose', 'Description', 'Talk',
     '2030-10-02 09:00:00', '2030-10-02 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-020', 'USR-006', 'USR-004', 'Not mine', 'Purpose', 'Description', 'Talk',
     '2030-10-02 09:00:00', '2030-10-02 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-007', 'EVT-019', 'VEN-002', '2030-10-02 09:00:00', '2030-10-02 12:00:00',
     'APPROVED'::"BookingStatus", 80, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-009', 'EVT-021', 'VEN-038', '2030-10-02 09:00:00', '2030-10-02 12:00:00',
     'APPROVED'::"BookingStatus", 80, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-008', 'EVT-020', 'VEN-003', '2030-10-02 09:00:00', '2030-10-02 12:00:00',
     'APPROVED'::"BookingStatus", 80, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
