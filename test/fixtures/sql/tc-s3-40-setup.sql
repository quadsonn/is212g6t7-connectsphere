-- tc-s3-40-setup.sql: an event whose booked venue became unavailable and is
-- flagged as needing a replacement (Story 52).
--
-- Pre-condition for TC-S3-40 (Story 38 AC-1, replacement venue through the
-- Story 52 replacement request). Load AFTER base-users.sql and base-venues.sql.
--
--   EVT-193   PLANNING "Lakeside Talk", organiser USR-006, Coordinator USR-004,
--             8 Oct 2030 01:00-09:00 UTC, 60 expected
--   BKG-078   APPROVED Main Hall (VEN-002), flagged on 20 Sep 2026 as needing a
--             replacement: "Main Hall closed for repairs"
--   REG-013   USR-001 REGISTERED

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "registrationEnabled", "registrationOpensAt", "registrationClosesAt",
  "status", "createdAt", "updatedAt") VALUES
  ('EVT-193', 'USR-006', 'USR-004', 'Lakeside Talk', 'Purpose', 'Description', 'Conference',
     '2030-10-08 01:00:00', '2030-10-08 09:00:00', 60, true, '2026-01-01 00:00:00', '2030-10-05 00:00:00',
     'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById",
  "replacementNeededAt", "unavailableFrom", "unavailableUntil", "unavailableReason", "createdAt", "updatedAt") VALUES
  ('BKG-078', 'EVT-193', 'VEN-002', '2030-10-08 01:00:00', '2030-10-08 09:00:00', 'APPROVED'::"BookingStatus", 60, 'USR-004',
     '2026-09-20 09:00:00', '2030-10-08 00:00:00', '2030-10-09 00:00:00', 'Main Hall closed for repairs', '2026-09-03 09:00:00', '2026-09-20 09:00:00');

INSERT INTO "Registration" ("id", "eventId", "attendeeId", "status", "phone", "withdrawnAt", "createdAt", "updatedAt") VALUES
  ('REG-013', 'EVT-193', 'USR-001', 'REGISTERED'::"RegistrationStatus", '+65 9123 4567', NULL, '2026-09-05 09:00:00', '2026-09-05 09:00:00');
