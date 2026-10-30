-- tc-s3-114-setup.sql: rival has mainHall at the new time.
--
-- Pre-condition for TC-S3-114, 120, 123 (also loaded mid-test: booked after the request was opened) (Story 48). Load AFTER tc-s3-113-setup.sql.
-- Times are UTC; the event runs 01:00-05:00 on 1 Oct 2030 and a request moves
-- it to the same time on 2 Oct.
--
--   BKG-115 APPROVED mainHall for rival, 2 Oct 01:00-05:00 (decision BDC-006)

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "equipmentNeeds", "createdAt", "updatedAt") VALUES
  ('BKG-115', 'EVT-250', 'VEN-063', '2030-10-02 01:00:00', '2030-10-02 05:00:00', 'APPROVED'::"BookingStatus", 100, 'USR-004', 'PA', '2026-09-03 09:00:00', '2026-09-03 09:00:00');

INSERT INTO "BookingDecision" ("id", "bookingId", "decidedById", "kind", "outcome", "reason", "createdAt") VALUES
  ('BDC-006', 'BKG-115', 'USR-010', 'DECISION'::"BookingDecisionKind", 'APPROVED'::"BookingStatus", 'Confirmed.', '2026-09-03 09:00:00');
