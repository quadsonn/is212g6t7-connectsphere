-- tc-s2-34-setup.sql: an APPROVED event assigned to USR-004, with
-- layout, accessibility and equipment requirements recorded, ready to have
-- Main Hall requested for it.
--
-- Pre-condition for TC-S2-34 (Story 20 AC-1), and the base for TC-S2-35 to
-- TC-S2-40. Load AFTER base-users.sql and base-venues.sql.
--
--   EVT-102  APPROVED "Orientation", USR-006 / USR-004,
--                     1 Oct 2030 09:00-12:00 UTC, 120 expected, THEATRE,
--                     HEARING_LOOP ("Two hearing aid users"), "2 wireless mics"

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "preferredLayout", "accessibilityRequirements",
  "accessibilityNotes", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-102', 'USR-006', 'USR-004', 'Orientation', 'Welcome', 'Programme', 'Student engagement',
     '2030-10-01 09:00:00', '2030-10-01 12:00:00', 120, 'THEATRE'::"RoomLayout",
     ARRAY['HEARING_LOOP']::"AccessibilityFeature"[], 'Two hearing aid users', '2 wireless mics',
     'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
