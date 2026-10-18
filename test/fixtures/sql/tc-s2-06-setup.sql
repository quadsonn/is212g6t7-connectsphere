-- tc-s2-06-setup.sql: one confirmed booking on Main Hall, with attendance and
-- an organiser, so its slot's details can be checked.
--
-- Pre-condition for TC-S2-06 (Story 16 AC-4). Load AFTER base-users.sql and
-- base-venues.sql. All times UTC.
--
--   b-s2-06-gala  Main Hall  Oct 2 09:00-12:00  APPROVED  "Gala", 80 expected,
--                 organised by u-organiser (Olivia Organiser)
INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-06-gala', 'u-organiser', 'u-coordinator-a', 'Gala', 'Purpose', 'Description', 'Talk',
     '2030-10-02 09:00:00', '2030-10-02 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('b-s2-06-gala', 'e-s2-06-gala', 'v-main-hall', '2030-10-02 09:00:00', '2030-10-02 12:00:00',
     'APPROVED'::"BookingStatus", 80, 'u-coordinator-a', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
