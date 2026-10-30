-- tc-s4-65-setup.sql: a confirmed event open for registration, across two venues.
--
-- Pre-condition for every test in test/us59-registration-notices.e2e-spec.ts
-- (Story 59, TC-S4-65 to 72). Load AFTER base-users.sql and tc-s3-99-setup.sql
-- (Attendees a1 to a8, USR-020 to USR-027). With Ann (USR-001) that is 9 Attendees.
--
--   VEN-083 "Main Hall" (10) and VEN-084 "Annex" (8), both Vera's (USR-010): capacity 18 in all
--   EVT-302 "Careers Fair" CONFIRMED, registration enabled, opens 1 Jan 2026,
--           closes 28 Nov 2030 00:00 UTC, event 1 Dec 2030 09:00-17:00 UTC
--   BKG-165 / BKG-166 APPROVED for EVT-302 at each venue
--   REG-016 to 018 REGISTERED (a1, a2, a3); REG-019 WITHDRAWN (a4): 15 seats left

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "status", "createdAt", "updatedAt") VALUES
  ('VEN-083', 'Main Hall', 'Level 1', 10, 'USR-010', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-084', 'Annex',     'Level 2',  8, 'USR-010', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "registrationEnabled",
  "registrationOpensAt", "registrationClosesAt", "createdAt", "updatedAt") VALUES
  ('EVT-302', 'USR-006', 'USR-004', 'Careers Fair', 'Meet employers', 'Stalls and talks', 'Careers',
     '2030-12-01 09:00:00', '2030-12-01 17:00:00', 18, 'CONFIRMED'::"EventStatus", true,
     '2026-01-01 00:00:00', '2030-11-28 00:00:00', '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('BKG-165', 'EVT-302', 'VEN-083', '2030-12-01 09:00:00', '2030-12-01 17:00:00', 'APPROVED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-166', 'EVT-302', 'VEN-084', '2030-12-01 09:00:00', '2030-12-01 17:00:00', 'APPROVED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');

INSERT INTO "Registration" ("id", "eventId", "attendeeId", "status", "phone", "withdrawnAt", "createdAt", "updatedAt") VALUES
  ('REG-016', 'EVT-302', 'USR-020', 'REGISTERED'::"RegistrationStatus", '+65 9123 4501', NULL, '2026-09-05 09:00:00', '2026-09-05 09:00:00'),
  ('REG-017', 'EVT-302', 'USR-021', 'REGISTERED'::"RegistrationStatus", '+65 9123 4502', NULL, '2026-09-05 09:00:00', '2026-09-05 09:00:00'),
  ('REG-018', 'EVT-302', 'USR-022', 'REGISTERED'::"RegistrationStatus", '+65 9123 4503', NULL, '2026-09-05 09:00:00', '2026-09-05 09:00:00'),
  ('REG-019', 'EVT-302', 'USR-023', 'WITHDRAWN'::"RegistrationStatus",  '+65 9123 4504', '2026-09-06 09:00:00', '2026-09-05 09:00:00', '2026-09-06 09:00:00');
