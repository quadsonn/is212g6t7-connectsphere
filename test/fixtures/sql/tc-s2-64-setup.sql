-- tc-s2-64-setup.sql: bookings the no-overlap database constraint must allow.
--
-- Pre-condition for TC-S2-64 (Story 23, database backstop): loading this
-- script must succeed. Load AFTER base-users.sql and base-venues.sql.
-- All on VEN-002, 1 Oct 2030 (UTC).
--
--   BKG-050    APPROVED  09:00-12:00
--   BKG-049  APPROVED  12:00-15:00  back-to-back with the morning
--   BKG-051  REQUESTED 10:00-11:00
--   BKG-052  REQUESTED 10:00-11:00  overlaps pending-a exactly

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-049', 'USR-006', 'USR-004', 'Morning', 'Purpose', 'Description', 'Talk',
     '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-048', 'USR-006', 'USR-004', 'Afternoon', 'Purpose', 'Description', 'Talk',
     '2030-10-01 12:00:00', '2030-10-01 15:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-050', 'USR-006', 'USR-004', 'Pending A', 'Purpose', 'Description', 'Talk',
     '2030-10-01 10:00:00', '2030-10-01 11:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-051', 'USR-006', 'USR-004', 'Pending B', 'Purpose', 'Description', 'Talk',
     '2030-10-01 10:00:00', '2030-10-01 11:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById",
  "createdAt", "updatedAt") VALUES
  ('BKG-050', 'EVT-049', 'VEN-002', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 'APPROVED'::"BookingStatus", 80, 'USR-004',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-049', 'EVT-048', 'VEN-002', '2030-10-01 12:00:00', '2030-10-01 15:00:00', 'APPROVED'::"BookingStatus", 80, 'USR-004',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-051', 'EVT-050', 'VEN-002', '2030-10-01 10:00:00', '2030-10-01 11:00:00', 'REQUESTED'::"BookingStatus", 80, 'USR-004',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-052', 'EVT-051', 'VEN-002', '2030-10-01 10:00:00', '2030-10-01 11:00:00', 'REQUESTED'::"BookingStatus", 80, 'USR-004',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00');
