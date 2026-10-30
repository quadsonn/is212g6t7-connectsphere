-- tc-s4-104g-setup.sql: Main Hall approved for the Town Hall.
--
-- Pre-condition for TC-S4-104 and 105 (the venue manager's notice is still
-- sent). Load AFTER tc-s4-104-setup.sql.
--
--   BKG-169 APPROVED Main Hall, 1 Oct 2030 10:00-12:00 UTC, requested by Carla; BDC-010 approved by Vanessa

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-169', 'EVT-312', 'VEN-087', '2030-10-01 10:00:00', '2030-10-01 12:00:00', 'APPROVED'::"BookingStatus", 100, 'USR-039', '2026-09-03 09:00:00', '2026-09-03 09:00:00');

INSERT INTO "BookingDecision" ("id", "bookingId", "decidedById", "kind", "outcome", "createdAt") VALUES
  ('BDC-010', 'BKG-169', 'USR-045', 'DECISION'::"BookingDecisionKind", 'APPROVED'::"BookingStatus", '2026-09-03 10:00:00');
