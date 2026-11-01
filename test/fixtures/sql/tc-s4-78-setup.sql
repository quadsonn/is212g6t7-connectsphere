-- tc-s4-78-setup.sql: the Town Hall's venue and equipment requirement.
--
-- Pre-condition for TC-S4-78 (the assignee's list shows date, time, venue and
-- technical requirements). Load AFTER tc-s4-76b-setup.sql.
--
--   VEN-085 "Harbour Hall", Level 2, 200; BKG-167 APPROVED for EVT-304, 09:30-12:30 UTC
--   REQ-017 EVT-304 needs 2 Wireless microphones ("Lapel")

INSERT INTO "Venue" ("id", "name", "location", "capacity", "status", "createdAt", "updatedAt") VALUES
  ('VEN-085', 'Harbour Hall', 'Level 2', 200, 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('BKG-167', 'EVT-304', 'VEN-085', '2030-10-01 09:30:00', '2030-10-01 12:30:00', 'APPROVED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');

INSERT INTO "EquipmentRequirement" ("id", "eventId", "equipmentType", "quantity", "notes", "createdAt", "updatedAt") VALUES
  ('REQ-017', 'EVT-304', 'Wireless microphone', 2, 'Lapel', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
