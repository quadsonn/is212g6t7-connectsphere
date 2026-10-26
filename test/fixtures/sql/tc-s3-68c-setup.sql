-- tc-s3-68c-setup.sql: two rejected Showcase requests whose suggestion can no
-- longer be accepted.
--
-- Pre-condition for TC-S3-68 (Story 41 AC-6, failure cases). Load AFTER
-- tc-s3-63-setup.sql.
--
--   BKG-095   REJECTED mainHall, 1 Jan 2026 09:00-12:00 UTC (already started), 80;
--             decision BDC-003, suggestion BSG-001 (eastHall)
--   BKG-096   REJECTED mainHall, 2 Oct 2030 09:00-12:00 UTC, no attendance recorded;
--             decision BDC-004, suggestion BSG-002 (eastHall)

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-095', 'EVT-196', 'VEN-041', '2026-01-01 09:00:00', '2026-01-01 12:00:00', 'REJECTED'::"BookingStatus", 80,   'USR-004', '2025-12-01 09:00:00', '2025-12-02 09:00:00'),
  ('BKG-096', 'EVT-196', 'VEN-041', '2030-10-02 09:00:00', '2030-10-02 12:00:00', 'REJECTED'::"BookingStatus", NULL, 'USR-004', '2026-09-03 09:00:00', '2026-09-04 09:00:00');

INSERT INTO "BookingDecision" ("id", "bookingId", "decidedById", "kind", "outcome", "reason", "createdAt") VALUES
  ('BDC-003', 'BKG-095', 'USR-010', 'DECISION'::"BookingDecisionKind", 'REJECTED'::"BookingStatus", 'Closed.', '2025-12-02 09:00:00'),
  ('BDC-004', 'BKG-096', 'USR-010', 'DECISION'::"BookingDecisionKind", 'REJECTED'::"BookingStatus", 'Closed.', '2026-09-04 09:00:00');

INSERT INTO "BookingSuggestion" ("id", "bookingId", "decisionId", "venueId", "createdAt") VALUES
  ('BSG-001', 'BKG-095', 'BDC-003', 'VEN-042', '2025-12-02 09:00:00'),
  ('BSG-002', 'BKG-096', 'BDC-004', 'VEN-042', '2026-09-04 09:00:00');
