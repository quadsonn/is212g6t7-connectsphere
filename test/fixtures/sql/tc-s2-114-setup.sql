-- tc-s2-114-setup.sql: events covering every mix of the three requirement
-- sources, plus one with none and a draft with all three.
--
-- Pre-condition for TC-S2-114 (Story 30 AC-1), and the base for TC-S2-115 to
-- TC-S2-120. Load AFTER base-users.sql. All PLANNING unless noted, assigned to
-- USR-004, 1 Oct 2030 09:00-17:00 UTC, with layout, accessibility and
-- programme filled in (for the details view).
--
-- The three sources: the Organiser's free-text equipment needs, the
-- Coordinator's requirement rows, and technical support notes (Story 27).
--
--   EVT-120  "Organiser Only"         equipment needs "Six wireless mics."
--   EVT-121       "Rows Only"              2 x Laser projector, then (a minute later) 6 x Wireless microphone ("Lapel")
--   EVT-119      "Notes Only"             support "On-site AV technician all day."
--   EVT-115        "All Three"              needs, support and 1 x PA system
--   EVT-118       "None Recorded"          nothing
--   EVT-117      "Draft With Everything"  DRAFT, all three sources

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "preferredLayout", "layoutNotes", "accessibilityRequirements",
  "accessibilityNotes", "programme", "equipmentNeeds", "technicalSupportNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-120', 'USR-006', 'USR-004', 'Organiser Only', 'Purpose', 'Organiser Only - description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'THEATRE'::"RoomLayout", 'Stage at the front',
     ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'Ramp at the side entrance', E'09:00 Welcome\n10:00 Talks',
     'Six wireless mics.', NULL, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-121', 'USR-006', 'USR-004', 'Rows Only', 'Purpose', 'Rows Only - description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'THEATRE'::"RoomLayout", 'Stage at the front',
     ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'Ramp at the side entrance', E'09:00 Welcome\n10:00 Talks',
     NULL, NULL, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-119', 'USR-006', 'USR-004', 'Notes Only', 'Purpose', 'Notes Only - description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'THEATRE'::"RoomLayout", 'Stage at the front',
     ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'Ramp at the side entrance', E'09:00 Welcome\n10:00 Talks',
     NULL, 'On-site AV technician all day.', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-115', 'USR-006', 'USR-004', 'All Three', 'Purpose', 'All Three - description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'THEATRE'::"RoomLayout", 'Stage at the front',
     ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'Ramp at the side entrance', E'09:00 Welcome\n10:00 Talks',
     'Mics and a projector.', 'Technician on call.', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-118', 'USR-006', 'USR-004', 'None Recorded', 'Purpose', 'None Recorded - description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'THEATRE'::"RoomLayout", 'Stage at the front',
     ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'Ramp at the side entrance', E'09:00 Welcome\n10:00 Talks',
     NULL, NULL, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-117', 'USR-006', 'USR-004', 'Draft With Everything', 'Purpose', 'Draft With Everything - description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'THEATRE'::"RoomLayout", 'Stage at the front',
     ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'Ramp at the side entrance', E'09:00 Welcome\n10:00 Talks',
     'Six mics.', 'Technician.', 'DRAFT'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "EquipmentRequirement" ("id", "eventId", "equipmentType", "quantity", "notes", "createdAt", "updatedAt") VALUES
  ('REQ-008', 'EVT-121', 'Laser projector', 2, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('REQ-007', 'EVT-121', 'Wireless microphone', 6, 'Lapel', '2026-09-02 09:01:00', '2026-09-02 09:01:00'),
  ('REQ-001', 'EVT-115', 'PA system', 1, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('REQ-004', 'EVT-117', 'PA system', 1, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00');
