-- tc-s3-113-setup.sql: a confirmed event with a venue and equipment, and a rival event.
--
-- Pre-condition for every test in test/events-change-request-check.e2e-spec.ts (TC-S3-113 to 123) (Story 48). Load AFTER base-users.sql.
-- Times are UTC; the event runs 01:00-05:00 on 1 Oct 2030 and a request moves
-- it to the same time on 2 Oct.
--
--   VEN-063 mainHall (200, setup 30, turnaround 45 min), VEN-064 annex (50), both Vera's (USR-010)
--   EQP-019 projector (6), EQP-020 microphone (10), EQP-021 brokenCamera (4, OUT_OF_SERVICE)
--   EVT-249 "conf" CONFIRMED, Coordinator USR-004: BKG-114 APPROVED mainHall (decision BDC-005), RSV-031 4 projectors
--   EVT-250 "rival" CONFIRMED, Coordinator USR-005

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "setupMinutes", "turnaroundMinutes", "status", "createdAt", "updatedAt") VALUES
  ('VEN-063', 'mainHall', 'Campus', 200, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 30, 45, 'PUBLISHED'::"VenueStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('VEN-064', 'annex', 'Campus', 50, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 0, 0, 'PUBLISHED'::"VenueStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');

INSERT INTO "Equipment" ("id", "type", "totalQuantity", "operationalStatus", "createdAt", "updatedAt") VALUES
  ('EQP-019', 'projector', 6, 'OPERATIONAL'::"EquipmentStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('EQP-020', 'microphone', 10, 'OPERATIONAL'::"EquipmentStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('EQP-021', 'brokenCamera', 4, 'OUT_OF_SERVICE'::"EquipmentStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-249', 'USR-006', 'USR-004', 'conf', 'p', 'd', 'c', '2030-10-01 01:00:00', '2030-10-01 05:00:00', 100, 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-250', 'USR-006', 'USR-005', 'rival', 'p', 'd', 'c', '2030-10-01 01:00:00', '2030-10-01 05:00:00', 100, 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "equipmentNeeds", "createdAt", "updatedAt") VALUES
  ('BKG-114', 'EVT-249', 'VEN-063', '2030-10-01 01:00:00', '2030-10-01 05:00:00', 'APPROVED'::"BookingStatus", 100, 'USR-004', 'PA', '2026-09-03 09:00:00', '2026-09-03 09:00:00');

INSERT INTO "BookingDecision" ("id", "bookingId", "decidedById", "kind", "outcome", "reason", "createdAt") VALUES
  ('BDC-005', 'BKG-114', 'USR-010', 'DECISION'::"BookingDecisionKind", 'APPROVED'::"BookingStatus", 'Confirmed.', '2026-09-03 09:00:00');

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-031', 'EVT-249', 'EQP-019', 4, '2030-10-01 01:00:00', '2030-10-01 05:00:00', 'APPROVED'::"ReservationStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
