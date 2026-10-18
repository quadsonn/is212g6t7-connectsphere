-- tc-s2-61-setup.sql: a confirmed booking on Main Hall overlapping the end of
-- the tc-s2-48 request.
--
-- Pre-condition for TC-S2-61 (Story 23 AC-5) and TC-S2-64. Load AFTER
-- base-users.sql, base-venues.sql and tc-s2-48-setup.sql.
--
--   b-s2-61-confirmed  "Confirmed"  APPROVED, v-main-hall, 1 Oct 2030 11:00-13:00 UTC

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-61-confirmed', 'u-organiser', 'u-coordinator-a', 'Confirmed', 'Purpose', 'Description', 'Talk',
     '2030-10-01 11:00:00', '2030-10-01 13:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById",
  "createdAt", "updatedAt") VALUES
  ('b-s2-61-confirmed', 'e-s2-61-confirmed', 'v-main-hall', '2030-10-01 11:00:00', '2030-10-01 13:00:00', 'APPROVED'::"BookingStatus", 80, 'u-coordinator-a',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00');
