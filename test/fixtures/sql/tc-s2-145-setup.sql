-- tc-s2-145-setup.sql: two registrations for USR-001, one active and one
-- withdrawn, on events with and without a confirmed venue.
--
-- Pre-condition for TC-S2-145 (Story 34 AC-1), and for TC-S2-146 and TC-S2-148.
-- Load AFTER base-users.sql and base-venues.sql.
--
--   EVT-062   CONFIRMED "Autumn Concert", 1 Oct 2030 18:00-21:00 UTC, APPROVED booking on Main Hall
--   EVT-132  CONFIRMED "Pottery Workshop", 15 Sep 2030 09:00-12:00 UTC, no venue booked
--   REG-001   USR-001 on Autumn Concert, REGISTERED
--   REG-008  USR-001 on Pottery Workshop, WITHDRAWN on 10 Sep 2026

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "registrationEnabled", "registrationOpensAt", "registrationClosesAt",
  "withdrawalCutoffAt", "status", "createdAt", "updatedAt") VALUES
  ('EVT-062', 'USR-006', 'USR-004', 'Autumn Concert', 'Purpose', 'Description', 'Social',
     '2030-10-01 18:00:00', '2030-10-01 21:00:00', 100, true, '2026-01-01 00:00:00', '2030-09-28 00:00:00', NULL, 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-132', 'USR-006', 'USR-004', 'Pottery Workshop', 'Purpose', 'Description', 'Social',
     '2030-09-15 09:00:00', '2030-09-15 12:00:00', 100, true, '2026-01-01 00:00:00', '2030-09-12 00:00:00', NULL, 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-056', 'EVT-062', 'VEN-002', '2030-10-01 18:00:00', '2030-10-01 21:00:00', 'APPROVED'::"BookingStatus", 100, 'USR-004', '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "Registration" ("id", "eventId", "attendeeId", "status", "phone", "withdrawnAt", "createdAt", "updatedAt") VALUES
  ('REG-001', 'EVT-062', 'USR-001', 'REGISTERED'::"RegistrationStatus", '+65 9123 4567', NULL, '2026-09-05 09:00:00', '2026-09-05 09:00:00'),
  ('REG-008', 'EVT-132', 'USR-001', 'WITHDRAWN'::"RegistrationStatus", '+65 9123 4567', '2026-09-10 09:00:00', '2026-09-05 09:00:00', '2026-09-05 09:00:00');
