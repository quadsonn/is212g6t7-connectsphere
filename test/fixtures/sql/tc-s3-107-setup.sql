-- tc-s3-107-setup.sql: an event in planning that cannot be fulfilled, holding
-- bookings and equipment, beside events it must not touch.
--
-- Pre-condition for every test in test/events-reject-unfulfillable.e2e-spec.ts
-- (Story 47, TC-S3-107 to 112). Load AFTER base-users.sql.
--
--   VEN-060 hallA, VEN-061 hallB, VEN-062 hallC (Campus, 300, managed by USR-010)
--   EQP-018 Projector, 4 in stock
--   EVT-238 "gala" PLANNING, USR-006 / USR-004, 1 Oct 2030 01:00-09:00 UTC, 120:
--     BKG-110 REQUESTED hallA (a pending hold), BKG-111 APPROVED hallB,
--     BKG-112 REJECTED hallC; RSV-028 3 projectors APPROVED, RSV-029 1 REQUESTED
--   EVT-247 "next" PLANNING, nothing booked
--   EVT-248 "bystander" PLANNING: BKG-113 APPROVED hallC; RSV-030 1 projector APPROVED on 1 Nov 2030

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "status", "createdAt", "updatedAt") VALUES
  ('VEN-060', 'hallA', 'Campus', 300, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-061', 'hallB', 'Campus', 300, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-062', 'hallC', 'Campus', 300, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "Equipment" ("id", "type", "totalQuantity", "createdAt", "updatedAt") VALUES
  ('EQP-018', 'Projector', 4, '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-238', 'USR-006', 'USR-004', 'gala', 'p', 'd', 'c', '2030-10-01 01:00:00', '2030-10-01 09:00:00', 120, 'Projectors', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-247', 'USR-006', 'USR-004', 'next', 'p', 'd', 'c', '2030-10-01 01:00:00', '2030-10-01 09:00:00', 120, 'Projectors', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-248', 'USR-006', 'USR-004', 'bystander', 'p', 'd', 'c', '2030-10-01 01:00:00', '2030-10-01 09:00:00', 120, 'Projectors', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "createdAt", "updatedAt") VALUES
  ('BKG-110', 'EVT-238', 'VEN-060', '2030-10-01 01:00:00', '2030-10-01 09:00:00', 'REQUESTED'::"BookingStatus", 120, '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-111', 'EVT-238', 'VEN-061', '2030-10-01 01:00:00', '2030-10-01 09:00:00', 'APPROVED'::"BookingStatus",  120, '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-112', 'EVT-238', 'VEN-062', '2030-10-01 01:00:00', '2030-10-01 09:00:00', 'REJECTED'::"BookingStatus",  120, '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-113', 'EVT-248', 'VEN-062', '2030-10-01 01:00:00', '2030-10-01 09:00:00', 'APPROVED'::"BookingStatus",  120, '2026-09-03 09:00:00', '2026-09-03 09:00:00');

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-028', 'EVT-238', 'EQP-018', 3, '2030-10-01 01:00:00', '2030-10-01 09:00:00', 'APPROVED'::"ReservationStatus",  '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('RSV-029', 'EVT-238', 'EQP-018', 1, '2030-10-01 01:00:00', '2030-10-01 09:00:00', 'REQUESTED'::"ReservationStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('RSV-030', 'EVT-248', 'EQP-018', 1, '2030-11-01 01:00:00', '2030-11-01 02:00:00', 'APPROVED'::"ReservationStatus",  '2026-09-03 09:00:00', '2026-09-03 09:00:00');
