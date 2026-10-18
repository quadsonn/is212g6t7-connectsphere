-- tc-s2-71-setup.sql: the tc-s2-68 event's venue booking, already APPROVED.
--
-- Pre-condition for TC-S2-71 (Story 24 AC-2), and for TC-S2-72 to TC-S2-74. Load AFTER
-- base-users.sql, base-venues.sql and tc-s2-68-setup.sql.
--
--   b-s2-71-approved  APPROVED, e-s2-planning on v-main-hall (u-venue-staff), 1 Oct 2030 08:00-18:00 UTC

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById",
  "createdAt", "updatedAt") VALUES
  ('b-s2-71-approved', 'e-s2-planning', 'v-main-hall', '2030-10-01 08:00:00', '2030-10-01 18:00:00', 'APPROVED'::"BookingStatus", 320, 'u-coordinator-a',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00');
