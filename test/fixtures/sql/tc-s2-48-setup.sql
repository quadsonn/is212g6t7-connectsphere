-- tc-s2-48-setup.sql: one pending venue booking request, waiting for Venue Staff.
--
-- Pre-condition for TC-S2-48 (Story 22 AC-1), and the base for TC-S2-49 to
-- TC-S2-54 and several Story 23 test cases (TC-S2-58 to TC-S2-61, TC-S2-64).
-- Load AFTER base-users.sql and base-venues.sql.
--
--   e-s2-48-showcase  APPROVED "Showcase", u-organiser / u-coordinator-a, 1 Oct 2030 09:00-12:00 UTC, 80 expected
--   b-s2-48-showcase  REQUESTED on v-main-hall (managed by u-venue-staff), 1 Oct 2030 09:00-12:00 UTC

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-48-showcase', 'u-organiser', 'u-coordinator-a', 'Showcase', 'Purpose', 'Description', 'Talk',
     '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById",
  "createdAt", "updatedAt") VALUES
  ('b-s2-48-showcase', 'e-s2-48-showcase', 'v-main-hall', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'u-coordinator-a',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00');
