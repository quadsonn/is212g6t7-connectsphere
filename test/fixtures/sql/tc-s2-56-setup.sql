-- tc-s2-56-setup.sql: five venues, each with a pending request (09:00-12:00)
-- and one confirmed booking placed in a different position against it.
--
-- Pre-condition for TC-S2-56 (Story 23 AC-1, AC-4). One venue per shape, as
-- the confirmed neighbours would otherwise overlap each other, which the
-- database refuses. All managed by USR-010, all on 1 Oct 2030 (UTC).
-- Load AFTER base-users.sql.
--
--   VEN-006  target 09:00-12:00 pending; "Early slot" 07:00-09:00 APPROVED
--   VEN-009  target 09:00-12:00 pending; "Late slot" 12:00-14:00 APPROVED
--   VEN-008     target 09:00-12:00 pending; "Long lunch" 11:59-13:00 APPROVED
--   VEN-007         target 09:00-12:00 pending; "Gala" 10:00-11:00 APPROVED
--   VEN-005         target 09:00-12:00 pending; "All-day fair" 08:00-13:00 APPROVED

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "status", "createdAt", "updatedAt") VALUES
  ('VEN-006', 'Hall Ends at start', 'Block E', 200, 'USR-010', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-009', 'Hall Starts at end', 'Block E', 200, 'USR-010', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-008', 'Hall One minute', 'Block E', 200, 'USR-010', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-007', 'Hall Inside', 'Block E', 200, 'USR-010', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-005', 'Hall Covers', 'Block E', 200, 'USR-010', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-039', 'USR-006', 'USR-004', 'Target Ends at start', 'Purpose', 'Description', 'Talk',
     '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-034', 'USR-006', 'USR-004', 'Early slot', 'Purpose', 'Description', 'Talk',
     '2030-10-01 07:00:00', '2030-10-01 09:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-042', 'USR-006', 'USR-004', 'Target Starts at end', 'Purpose', 'Description', 'Talk',
     '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-037', 'USR-006', 'USR-004', 'Late slot', 'Purpose', 'Description', 'Talk',
     '2030-10-01 12:00:00', '2030-10-01 14:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-041', 'USR-006', 'USR-004', 'Target One minute', 'Purpose', 'Description', 'Talk',
     '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-036', 'USR-006', 'USR-004', 'Long lunch', 'Purpose', 'Description', 'Talk',
     '2030-10-01 11:59:00', '2030-10-01 13:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-040', 'USR-006', 'USR-004', 'Target Inside', 'Purpose', 'Description', 'Talk',
     '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-035', 'USR-006', 'USR-004', 'Gala', 'Purpose', 'Description', 'Talk',
     '2030-10-01 10:00:00', '2030-10-01 11:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-038', 'USR-006', 'USR-004', 'Target Covers', 'Purpose', 'Description', 'Talk',
     '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-033', 'USR-006', 'USR-004', 'All-day fair', 'Purpose', 'Description', 'Talk',
     '2030-10-01 08:00:00', '2030-10-01 13:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById",
  "createdAt", "updatedAt") VALUES
  ('BKG-040', 'EVT-039', 'VEN-006', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'USR-004',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-035', 'EVT-034', 'VEN-006', '2030-10-01 07:00:00', '2030-10-01 09:00:00', 'APPROVED'::"BookingStatus", 80, 'USR-004',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-043', 'EVT-042', 'VEN-009', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'USR-004',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-038', 'EVT-037', 'VEN-009', '2030-10-01 12:00:00', '2030-10-01 14:00:00', 'APPROVED'::"BookingStatus", 80, 'USR-004',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-042', 'EVT-041', 'VEN-008', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'USR-004',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-037', 'EVT-036', 'VEN-008', '2030-10-01 11:59:00', '2030-10-01 13:00:00', 'APPROVED'::"BookingStatus", 80, 'USR-004',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-041', 'EVT-040', 'VEN-007', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'USR-004',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-036', 'EVT-035', 'VEN-007', '2030-10-01 10:00:00', '2030-10-01 11:00:00', 'APPROVED'::"BookingStatus", 80, 'USR-004',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-039', 'EVT-038', 'VEN-005', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'USR-004',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-034', 'EVT-033', 'VEN-005', '2030-10-01 08:00:00', '2030-10-01 13:00:00', 'APPROVED'::"BookingStatus", 80, 'USR-004',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00');
