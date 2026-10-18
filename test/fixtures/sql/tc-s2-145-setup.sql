-- tc-s2-145-setup.sql: two registrations for u-attendee, one active and one
-- withdrawn, on events with and without a confirmed venue.
--
-- Pre-condition for TC-S2-145 (Story 34 AC-1), and for TC-S2-146 and TC-S2-148.
-- Load AFTER base-users.sql and base-venues.sql.
--
--   e-s2-concert   CONFIRMED "Autumn Concert", 1 Oct 2030 18:00-21:00 UTC, APPROVED booking on Main Hall
--   e-s2-workshop  CONFIRMED "Pottery Workshop", 15 Sep 2030 09:00-12:00 UTC, no venue booked
--   g-s2-concert   u-attendee on Autumn Concert, REGISTERED
--   g-s2-workshop  u-attendee on Pottery Workshop, WITHDRAWN on 10 Sep 2026

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "registrationEnabled", "registrationOpensAt", "registrationClosesAt",
  "withdrawalCutoffAt", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-concert', 'u-organiser', 'u-coordinator-a', 'Autumn Concert', 'Purpose', 'Description', 'Social',
     '2030-10-01 18:00:00', '2030-10-01 21:00:00', 100, true, '2026-01-01 00:00:00', '2030-09-28 00:00:00', NULL, 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-workshop', 'u-organiser', 'u-coordinator-a', 'Pottery Workshop', 'Purpose', 'Description', 'Social',
     '2030-09-15 09:00:00', '2030-09-15 12:00:00', 100, true, '2026-01-01 00:00:00', '2030-09-12 00:00:00', NULL, 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('b-s2-concert', 'e-s2-concert', 'v-main-hall', '2030-10-01 18:00:00', '2030-10-01 21:00:00', 'APPROVED'::"BookingStatus", 100, 'u-coordinator-a', '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "Registration" ("id", "eventId", "attendeeId", "status", "phone", "withdrawnAt", "createdAt", "updatedAt") VALUES
  ('g-s2-concert', 'e-s2-concert', 'u-attendee', 'REGISTERED'::"RegistrationStatus", '+65 9123 4567', NULL, '2026-09-05 09:00:00', '2026-09-05 09:00:00'),
  ('g-s2-workshop', 'e-s2-workshop', 'u-attendee', 'WITHDRAWN'::"RegistrationStatus", '+65 9123 4567', '2026-09-10 09:00:00', '2026-09-05 09:00:00', '2026-09-05 09:00:00');
