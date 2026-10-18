-- tc-s2-56-setup.sql: five venues, each with a pending request (09:00-12:00)
-- and one confirmed booking placed in a different position against it.
--
-- Pre-condition for TC-S2-56 (Story 23 AC-1, AC-4). One venue per shape, as
-- the confirmed neighbours would otherwise overlap each other, which the
-- database refuses. All managed by u-venue-staff, all on 1 Oct 2030 (UTC).
-- Load AFTER base-users.sql.
--
--   v-s2-56-ends-at-start  target 09:00-12:00 pending; "Early slot" 07:00-09:00 APPROVED
--   v-s2-56-starts-at-end  target 09:00-12:00 pending; "Late slot" 12:00-14:00 APPROVED
--   v-s2-56-one-minute     target 09:00-12:00 pending; "Long lunch" 11:59-13:00 APPROVED
--   v-s2-56-inside         target 09:00-12:00 pending; "Gala" 10:00-11:00 APPROVED
--   v-s2-56-covers         target 09:00-12:00 pending; "All-day fair" 08:00-13:00 APPROVED

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "status", "createdAt", "updatedAt") VALUES
  ('v-s2-56-ends-at-start', 'Hall Ends at start', 'Block E', 200, 'u-venue-staff', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('v-s2-56-starts-at-end', 'Hall Starts at end', 'Block E', 200, 'u-venue-staff', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('v-s2-56-one-minute', 'Hall One minute', 'Block E', 200, 'u-venue-staff', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('v-s2-56-inside', 'Hall Inside', 'Block E', 200, 'u-venue-staff', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('v-s2-56-covers', 'Hall Covers', 'Block E', 200, 'u-venue-staff', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-56-target-ends-at-start', 'u-organiser', 'u-coordinator-a', 'Target Ends at start', 'Purpose', 'Description', 'Talk',
     '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-56-ends-at-start', 'u-organiser', 'u-coordinator-a', 'Early slot', 'Purpose', 'Description', 'Talk',
     '2030-10-01 07:00:00', '2030-10-01 09:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-56-target-starts-at-end', 'u-organiser', 'u-coordinator-a', 'Target Starts at end', 'Purpose', 'Description', 'Talk',
     '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-56-starts-at-end', 'u-organiser', 'u-coordinator-a', 'Late slot', 'Purpose', 'Description', 'Talk',
     '2030-10-01 12:00:00', '2030-10-01 14:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-56-target-one-minute', 'u-organiser', 'u-coordinator-a', 'Target One minute', 'Purpose', 'Description', 'Talk',
     '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-56-one-minute', 'u-organiser', 'u-coordinator-a', 'Long lunch', 'Purpose', 'Description', 'Talk',
     '2030-10-01 11:59:00', '2030-10-01 13:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-56-target-inside', 'u-organiser', 'u-coordinator-a', 'Target Inside', 'Purpose', 'Description', 'Talk',
     '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-56-inside', 'u-organiser', 'u-coordinator-a', 'Gala', 'Purpose', 'Description', 'Talk',
     '2030-10-01 10:00:00', '2030-10-01 11:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-56-target-covers', 'u-organiser', 'u-coordinator-a', 'Target Covers', 'Purpose', 'Description', 'Talk',
     '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-56-covers', 'u-organiser', 'u-coordinator-a', 'All-day fair', 'Purpose', 'Description', 'Talk',
     '2030-10-01 08:00:00', '2030-10-01 13:00:00', 80, NULL, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById",
  "createdAt", "updatedAt") VALUES
  ('b-s2-56-target-ends-at-start', 'e-s2-56-target-ends-at-start', 'v-s2-56-ends-at-start', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'u-coordinator-a',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-56-ends-at-start', 'e-s2-56-ends-at-start', 'v-s2-56-ends-at-start', '2030-10-01 07:00:00', '2030-10-01 09:00:00', 'APPROVED'::"BookingStatus", 80, 'u-coordinator-a',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-56-target-starts-at-end', 'e-s2-56-target-starts-at-end', 'v-s2-56-starts-at-end', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'u-coordinator-a',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-56-starts-at-end', 'e-s2-56-starts-at-end', 'v-s2-56-starts-at-end', '2030-10-01 12:00:00', '2030-10-01 14:00:00', 'APPROVED'::"BookingStatus", 80, 'u-coordinator-a',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-56-target-one-minute', 'e-s2-56-target-one-minute', 'v-s2-56-one-minute', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'u-coordinator-a',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-56-one-minute', 'e-s2-56-one-minute', 'v-s2-56-one-minute', '2030-10-01 11:59:00', '2030-10-01 13:00:00', 'APPROVED'::"BookingStatus", 80, 'u-coordinator-a',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-56-target-inside', 'e-s2-56-target-inside', 'v-s2-56-inside', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'u-coordinator-a',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-56-inside', 'e-s2-56-inside', 'v-s2-56-inside', '2030-10-01 10:00:00', '2030-10-01 11:00:00', 'APPROVED'::"BookingStatus", 80, 'u-coordinator-a',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-56-target-covers', 'e-s2-56-target-covers', 'v-s2-56-covers', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'u-coordinator-a',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-56-covers', 'e-s2-56-covers', 'v-s2-56-covers', '2030-10-01 08:00:00', '2030-10-01 13:00:00', 'APPROVED'::"BookingStatus", 80, 'u-coordinator-a',
     '2026-09-03 09:00:00', '2026-09-03 09:00:00');
