-- tc-s2-35-setup.sql: an event with technical requirements recorded, and a
-- booking request made before requests carried them, for Story 20 AC-2
-- (the event's requirements are attached to the request).
--
-- Pre-condition for TC-S2-35. Load AFTER base-users.sql, base-venues.sql and
-- tc-s2-34-setup.sql. Times UTC.
--
--   EVT-190  as EVT-102 "Orientation" (APPROVED, USR-006 / USR-004,
--            1 Oct 2030 09:00-12:00, 120 expected, THEATRE, HEARING_LOOP,
--            "2 wireless mics"), plus:
--              required facilities PROJECTOR, STAGE
--              technical support "A technician on site for sound checks"
--              REQ-001  2 x Projector (EQP-001, from the catalogue), "HDMI"
--              REQ-002  1 x "Fog machine" (free text)
--   EQP-001  "Projector", 4 units
--   BKG-001  EVT-102 on Main Hall, 1 Oct 2030 09:00-12:00, REQUESTED, made
--            before requests carried a copy of the equipment list
--            (equipmentRequirements NULL)

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "preferredLayout", "accessibilityRequirements",
  "accessibilityNotes", "equipmentNeeds", "requiredFacilities", "technicalSupportNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-190', 'USR-006', 'USR-004', 'Orientation (technical)', 'Welcome', 'Programme', 'Student engagement',
     '2030-10-01 09:00:00', '2030-10-01 12:00:00', 120, 'THEATRE'::"RoomLayout",
     ARRAY['HEARING_LOOP']::"AccessibilityFeature"[], 'Two hearing aid users', '2 wireless mics',
     ARRAY['PROJECTOR', 'STAGE']::"Facility"[], 'A technician on site for sound checks',
     'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "Equipment" ("id", "type", "description", "location", "totalQuantity", "operationalStatus", "createdAt", "updatedAt") VALUES
  ('EQP-001', 'Projector', NULL, NULL, 4, 'OPERATIONAL'::"EquipmentStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EquipmentRequirement" ("id", "eventId", "equipmentId", "equipmentType", "quantity", "notes", "createdAt", "updatedAt") VALUES
  ('REQ-001', 'EVT-190', 'EQP-001', 'Projector', 2, 'HDMI', '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('REQ-002', 'EVT-190', NULL, 'Fog machine', 1, NULL, '2026-09-02 09:01:00', '2026-09-02 09:01:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-001', 'EVT-102', 'VEN-002', '2030-10-01 09:00:00', '2030-10-01 12:00:00',
     'REQUESTED'::"BookingStatus", 120, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
