-- tc-s2-02-setup.sql: one booking of each status on Main Hall, one booking on
-- another staff member's venue, and one blocked period on Seminar Room.
--
-- Pre-condition for TC-S2-02 (Story 16 AC-1). Load AFTER base-users.sql,
-- base-venues.sql and tc-s2-01-setup.sql. All times UTC, October 2030.
--
--   BKG-003    Main Hall    Oct 2 09:00-12:00  REQUESTED  "Pending talk"
--   BKG-001  Main Hall    Oct 3 09:00-12:00  APPROVED   "Confirmed gala"
--   BKG-004   Main Hall    Oct 4 09:00-12:00  REJECTED   "Rejected one"
--   BKG-002   Other Hall   Oct 2 09:00-12:00  APPROVED   "Not mine"
--   BLK-001    Seminar Room Oct 5 00:00 - Oct 6 00:00, blocked "Holiday"
INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-015', 'USR-006', 'USR-004', 'Pending talk', 'Purpose', 'Description', 'Talk',
     '2030-10-02 09:00:00', '2030-10-02 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-013', 'USR-006', 'USR-004', 'Confirmed gala', 'Purpose', 'Description', 'Talk',
     '2030-10-03 09:00:00', '2030-10-03 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-016', 'USR-006', 'USR-004', 'Rejected one', 'Purpose', 'Description', 'Talk',
     '2030-10-04 09:00:00', '2030-10-04 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-014', 'USR-006', 'USR-004', 'Not mine', 'Purpose', 'Description', 'Talk',
     '2030-10-02 09:00:00', '2030-10-02 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-003', 'EVT-015', 'VEN-002', '2030-10-02 09:00:00', '2030-10-02 12:00:00',
     'REQUESTED'::"BookingStatus", 80, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-001', 'EVT-013', 'VEN-002', '2030-10-03 09:00:00', '2030-10-03 12:00:00',
     'APPROVED'::"BookingStatus", 80, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-004', 'EVT-016', 'VEN-002', '2030-10-04 09:00:00', '2030-10-04 12:00:00',
     'REJECTED'::"BookingStatus", 80, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-002', 'EVT-014', 'VEN-003', '2030-10-02 09:00:00', '2030-10-02 12:00:00',
     'APPROVED'::"BookingStatus", 80, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');

INSERT INTO "VenueBlock" ("id", "venueId", "start", "end", "reason", "createdById", "createdAt") VALUES
  ('BLK-001', 'VEN-038', '2030-10-05 00:00:00', '2030-10-06 00:00:00', 'Holiday', 'USR-010', '2026-09-03 09:00:00');
