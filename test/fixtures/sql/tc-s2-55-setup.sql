-- tc-s2-55-setup.sql: two pending requests for Main Hall whose times overlap.
--
-- Pre-condition for TC-S2-55 (Story 22, approval checks the slot), and for
-- TC-S2-53 (Story 22), TC-S2-57 and TC-S2-62 to TC-S2-64 (Story 23). Neither is approved,
-- so both may exist; only one of them can ever be approved.
-- Load AFTER base-users.sql and base-venues.sql.
--
--   BKG-032   "First"   REQUESTED, VEN-002, 1 Oct 2030 09:00-12:00 UTC
--   BKG-033  "Second"  REQUESTED, VEN-002, 1 Oct 2030 10:00-13:00 UTC

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-031', 'USR-006', 'USR-004', 'First', 'Purpose', 'Description', 'Talk',
     '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-032', 'USR-006', 'USR-004', 'Second', 'Purpose', 'Description', 'Talk',
     '2030-10-01 10:00:00', '2030-10-01 13:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById",
  "createdAt", "updatedAt") VALUES
  ('BKG-032', 'EVT-031', 'VEN-002', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'USR-004',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-033', 'EVT-032', 'VEN-002', '2030-10-01 10:00:00', '2030-10-01 13:00:00', 'REQUESTED'::"BookingStatus", 80, 'USR-004',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00');
