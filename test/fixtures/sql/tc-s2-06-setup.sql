-- tc-s2-06-setup.sql: one confirmed booking on Main Hall, with attendance and
-- an organiser, so its slot's details can be checked.
--
-- Pre-condition for TC-S2-06 (Story 16 AC-4). Load AFTER base-users.sql and
-- base-venues.sql. All times UTC.
--
--   BKG-010  Main Hall  Oct 2 09:00-12:00  APPROVED  "Gala", 80 expected,
--                 organised by USR-006 (Olivia Organiser)
INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-022', 'USR-006', 'USR-004', 'Gala', 'Purpose', 'Description', 'Talk',
     '2030-10-02 09:00:00', '2030-10-02 12:00:00', 80, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-010', 'EVT-022', 'VEN-002', '2030-10-02 09:00:00', '2030-10-02 12:00:00',
     'APPROVED'::"BookingStatus", 80, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
