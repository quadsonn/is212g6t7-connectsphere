-- tc-s3-39-setup.sql: a two-venue event whose Main Hall booking was reversed,
-- with a request for a replacement venue awaiting approval.
--
-- Pre-condition for TC-S3-39 (Story 38 AC-1, replacement venue) and TC-S3-44
-- (AC-5, several venues). Load AFTER base-users.sql and base-venues.sql.
--
--   EVT-192   PLANNING "Riverside Fair", organiser USR-006, Coordinator USR-004,
--             5 Oct 2030 01:00-09:00 UTC, 30 expected
--   BKG-075   APPROVED Rooftop Terrace (VEN-004): the venue that does not change
--   BKG-076   Main Hall (VEN-002), approved (BDC-001) then reversed to
--             REJECTED (BDC-002, "Main Hall flooded"): the venue being replaced
--   BKG-077   REQUESTED Seminar Room (VEN-038, capacity 40): the replacement
--   REG-012   USR-001 REGISTERED

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "registrationEnabled", "registrationOpensAt", "registrationClosesAt",
  "status", "createdAt", "updatedAt") VALUES
  ('EVT-192', 'USR-006', 'USR-004', 'Riverside Fair', 'Purpose', 'Description', 'Social',
     '2030-10-05 01:00:00', '2030-10-05 09:00:00', 30, true, '2026-01-01 00:00:00', '2030-10-01 00:00:00',
     'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "decisionReason", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-075', 'EVT-192', 'VEN-004', '2030-10-05 01:00:00', '2030-10-05 09:00:00', 'APPROVED'::"BookingStatus", NULL, 30, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-076', 'EVT-192', 'VEN-002', '2030-10-05 01:00:00', '2030-10-05 09:00:00', 'REJECTED'::"BookingStatus", 'Main Hall flooded', 30, 'USR-004', '2026-09-03 09:00:00', '2026-09-20 09:00:00'),
  ('BKG-077', 'EVT-192', 'VEN-038', '2030-10-05 01:00:00', '2030-10-05 09:00:00', 'REQUESTED'::"BookingStatus", NULL, 30, 'USR-004', '2026-09-21 09:00:00', '2026-09-21 09:00:00');

INSERT INTO "BookingDecision" ("id", "bookingId", "decidedById", "kind", "outcome", "reason", "createdAt") VALUES
  ('BDC-001', 'BKG-076', 'USR-010', 'DECISION'::"BookingDecisionKind", 'APPROVED'::"BookingStatus", NULL, '2026-09-04 09:00:00'),
  ('BDC-002', 'BKG-076', 'USR-010', 'REVERSAL'::"BookingDecisionKind", 'REJECTED'::"BookingStatus", 'Main Hall flooded', '2026-09-20 09:00:00');

INSERT INTO "Registration" ("id", "eventId", "attendeeId", "status", "phone", "withdrawnAt", "createdAt", "updatedAt") VALUES
  ('REG-012', 'EVT-192', 'USR-001', 'REGISTERED'::"RegistrationStatus", '+65 9123 4567', NULL, '2026-09-05 09:00:00', '2026-09-05 09:00:00');
