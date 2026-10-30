-- tc-s2-30-setup.sql: facilities and equipment for Story 19 AC-3 (does the
-- venue cover the event's equipment/technical requirements?).
--
-- Pre-condition for TC-S2-30 and TC-S2-184. Load AFTER base-users.sql and
-- tc-s2-28-setup.sql (VEN-035 "Hall": no facilities; EVT-076 "Fits").
-- Every event below is a copy of EVT-076 (APPROVED, USR-006's, assigned to
-- USR-004, 80 expected, STEP_FREE_ACCESS, THEATRE, 10 Mar 2027 09:00-17:00
-- SGT) except for what it needs. Each equipment scenario has its own item, so
-- one scenario's reservations never affect another's. Times are UTC.
--
-- Facilities (TC-S2-30)
--   VEN-036  "Equipped hall": as VEN-035, plus PROJECTOR and MICROPHONE
--   EVT-180  needs PROJECTOR + MICROPHONE  (all met at VEN-036)
--   EVT-181  needs PROJECTOR + STAGE       (STAGE missing at VEN-036)
--
-- Equipment (TC-S2-184): each event needs one catalogue item
--   EVT-182  4 x EQP-001 "Wireless mic A" (6)                    nothing else holds it
--   EVT-183  4 x EQP-002 "Wireless mic B" (6)                    EVT-184 holds 3, APPROVED
--   EVT-185  4 x EQP-003 "Wireless mic C" (6)                    EVT-185's own APPROVED 4
--   EVT-186  4 x EQP-004 "Wireless mic D" (6)                    EVT-184 holds 6, only REQUESTED
--   EVT-187  1 x EQP-005 "Wireless mic E" (6, UNDER_MAINTENANCE)
--   EVT-188  1 x "Fog machine", free text, not in the catalogue
--   EVT-184  "Other": another event the same day, holding units
--   Reservations overlap 10 Mar 2027 05:00-12:00 UTC.

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "supportedLayouts", "status", "createdAt", "updatedAt") VALUES
  ('VEN-036', 'Equipped hall', 'Campus', 100, 'USR-010', ARRAY['PROJECTOR', 'MICROPHONE']::"Facility"[],
     ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], ARRAY['THEATRE']::"RoomLayout"[],
     'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "accessibilityRequirements", "preferredLayout",
  "requiredFacilities", "status", "createdAt", "updatedAt") VALUES
  ('EVT-180', 'USR-006', 'USR-004', 'Needs projector and mics', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 80, ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'THEATRE'::"RoomLayout",
     ARRAY['PROJECTOR', 'MICROPHONE']::"Facility"[], 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-181', 'USR-006', 'USR-004', 'Needs a stage', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 80, ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'THEATRE'::"RoomLayout",
     ARRAY['PROJECTOR', 'STAGE']::"Facility"[], 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-182', 'USR-006', 'USR-004', 'Mics, plenty free', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 80, ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'THEATRE'::"RoomLayout",
     ARRAY[]::"Facility"[], 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-183', 'USR-006', 'USR-004', 'Mics, mostly taken', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 80, ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'THEATRE'::"RoomLayout",
     ARRAY[]::"Facility"[], 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-184', 'USR-006', 'USR-004', 'Other', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 40, ARRAY[]::"AccessibilityFeature"[], NULL,
     ARRAY[]::"Facility"[], 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-185', 'USR-006', 'USR-004', 'Mics, own reservation', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 80, ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'THEATRE'::"RoomLayout",
     ARRAY[]::"Facility"[], 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-186', 'USR-006', 'USR-004', 'Mics, pending elsewhere', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 80, ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'THEATRE'::"RoomLayout",
     ARRAY[]::"Facility"[], 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-187', 'USR-006', 'USR-004', 'Mic under maintenance', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 80, ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'THEATRE'::"RoomLayout",
     ARRAY[]::"Facility"[], 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-188', 'USR-006', 'USR-004', 'Fog machine', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 80, ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'THEATRE'::"RoomLayout",
     ARRAY[]::"Facility"[], 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "Equipment" ("id", "type", "description", "location", "totalQuantity", "operationalStatus", "createdAt", "updatedAt") VALUES
  ('EQP-001', 'Wireless mic A', NULL, NULL, 6, 'OPERATIONAL'::"EquipmentStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('EQP-002', 'Wireless mic B', NULL, NULL, 6, 'OPERATIONAL'::"EquipmentStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('EQP-003', 'Wireless mic C', NULL, NULL, 6, 'OPERATIONAL'::"EquipmentStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('EQP-004', 'Wireless mic D', NULL, NULL, 6, 'OPERATIONAL'::"EquipmentStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('EQP-005', 'Wireless mic E', NULL, NULL, 6, 'UNDER_MAINTENANCE'::"EquipmentStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EquipmentRequirement" ("id", "eventId", "equipmentId", "equipmentType", "quantity", "notes", "createdAt", "updatedAt") VALUES
  ('REQ-001', 'EVT-182', 'EQP-001', 'Wireless mic A', 4, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('REQ-002', 'EVT-183', 'EQP-002', 'Wireless mic B', 4, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('REQ-003', 'EVT-185', 'EQP-003', 'Wireless mic C', 4, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('REQ-004', 'EVT-186', 'EQP-004', 'Wireless mic D', 4, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('REQ-005', 'EVT-187', 'EQP-005', 'Wireless mic E', 1, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('REQ-006', 'EVT-188', NULL, 'Fog machine', 1, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "releasedAt", "createdAt", "updatedAt") VALUES
  ('RSV-001', 'EVT-184', 'EQP-002', 3, '2027-03-10 05:00:00', '2027-03-10 12:00:00', 'APPROVED'::"ReservationStatus", NULL, '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('RSV-002', 'EVT-185', 'EQP-003', 4, '2027-03-10 05:00:00', '2027-03-10 12:00:00', 'APPROVED'::"ReservationStatus", NULL, '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('RSV-003', 'EVT-184', 'EQP-004', 6, '2027-03-10 05:00:00', '2027-03-10 12:00:00', 'REQUESTED'::"ReservationStatus", NULL, '2026-09-03 09:00:00', '2026-09-03 09:00:00');
