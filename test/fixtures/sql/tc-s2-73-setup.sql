-- tc-s2-73-setup.sql: the tc-s2-68 event's venue booking, still only REQUESTED.
--
-- Pre-condition for TC-S2-73 (Story 24 AC-2): nothing is confirmed yet, so an
-- edit is ordinary. Load AFTER base-users.sql, base-venues.sql and tc-s2-68-setup.sql.
--
--   b-s2-73-requested  REQUESTED, e-s2-planning on v-main-hall, 1 Oct 2030 08:00-18:00 UTC

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById",
  "createdAt", "updatedAt") VALUES
  ('b-s2-73-requested', 'e-s2-planning', 'v-main-hall', '2030-10-01 08:00:00', '2030-10-01 18:00:00', 'REQUESTED'::"BookingStatus", 320, 'u-coordinator-a',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00');
