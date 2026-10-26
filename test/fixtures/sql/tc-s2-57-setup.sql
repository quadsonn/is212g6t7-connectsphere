-- tc-s2-57-setup.sql: a pending request on Main Hall with one confirmed, one
-- pending and one rejected booking around it.
--
-- Pre-condition for TC-S2-57 (Story 23 AC-2, AC-3). Load AFTER base-users.sql
-- and base-venues.sql. All on VEN-002, 1 Oct 2030 (UTC).
--
--   BKG-046       "Target"       REQUESTED 09:00-12:00  (the request being reviewed)
--   BKG-044    "Confirmed"    APPROVED  09:30-10:00  hard conflict
--   BKG-045      "Pending"      REQUESTED 10:30-11:00  soft conflict
--   BKG-047  "Turned down"  REJECTED  09:00-12:00  no conflict

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-045', 'USR-006', 'USR-004', 'Target', 'Purpose', 'Description', 'Talk',
     '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-043', 'USR-006', 'USR-004', 'Confirmed', 'Purpose', 'Description', 'Talk',
     '2030-10-01 09:30:00', '2030-10-01 10:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-044', 'USR-006', 'USR-004', 'Pending', 'Purpose', 'Description', 'Talk',
     '2030-10-01 10:30:00', '2030-10-01 11:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-046', 'USR-006', 'USR-004', 'Turned down', 'Purpose', 'Description', 'Talk',
     '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById",
  "createdAt", "updatedAt") VALUES
  ('BKG-046', 'EVT-045', 'VEN-002', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'USR-004',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-044', 'EVT-043', 'VEN-002', '2030-10-01 09:30:00', '2030-10-01 10:00:00', 'APPROVED'::"BookingStatus", 80, 'USR-004',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-045', 'EVT-044', 'VEN-002', '2030-10-01 10:30:00', '2030-10-01 11:00:00', 'REQUESTED'::"BookingStatus", 80, 'USR-004',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-047', 'EVT-046', 'VEN-002', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 'REJECTED'::"BookingStatus", 80, 'USR-004',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00');
