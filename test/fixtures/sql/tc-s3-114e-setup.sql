-- tc-s3-114e-setup.sql: conf also has annex, which rival holds at the new time.
--
-- Pre-condition for TC-S3-114, TC-S3-116 (Story 48). Load AFTER tc-s3-113-setup.sql.
-- Times are UTC; the event runs 01:00-05:00 on 1 Oct 2030 and a request moves
-- it to the same time on 2 Oct.
--
--   BKG-117 APPROVED annex for conf (old time, decision BDC-008)
--   BKG-118 APPROVED annex for rival (new time, decision BDC-009)

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "equipmentNeeds", "createdAt", "updatedAt") VALUES
  ('BKG-117', 'EVT-249', 'VEN-064', '2030-10-01 01:00:00', '2030-10-01 05:00:00', 'APPROVED'::"BookingStatus", 100, 'USR-004', 'PA', '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-118', 'EVT-250', 'VEN-064', '2030-10-02 01:00:00', '2030-10-02 05:00:00', 'APPROVED'::"BookingStatus", 100, 'USR-004', 'PA', '2026-09-03 09:00:00', '2026-09-03 09:00:00');

INSERT INTO "BookingDecision" ("id", "bookingId", "decidedById", "kind", "outcome", "reason", "createdAt") VALUES
  ('BDC-008', 'BKG-117', 'USR-010', 'DECISION'::"BookingDecisionKind", 'APPROVED'::"BookingStatus", 'Confirmed.', '2026-09-03 09:00:00'),
  ('BDC-009', 'BKG-118', 'USR-010', 'DECISION'::"BookingDecisionKind", 'APPROVED'::"BookingStatus", 'Confirmed.', '2026-09-03 09:00:00');
