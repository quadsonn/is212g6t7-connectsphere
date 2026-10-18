-- tc-s2-114-setup.sql: events covering every mix of the three requirement
-- sources, plus one with none and a draft with all three.
--
-- Pre-condition for TC-S2-114 (Story 30 AC-1), and the base for TC-S2-115 to
-- TC-S2-120. Load AFTER base-users.sql. All PLANNING unless noted, assigned to
-- u-coordinator-a, 1 Oct 2030 09:00-17:00 UTC, with layout, accessibility and
-- programme filled in (for the details view).
--
-- The three sources: the Organiser's free-text equipment needs, the
-- Coordinator's requirement rows, and technical support notes (Story 27).
--
--   e-s2-req-organiser  "Organiser Only"         equipment needs "Six wireless mics."
--   e-s2-req-rows       "Rows Only"              2 x Laser projector, then (a minute later) 6 x Wireless microphone ("Lapel")
--   e-s2-req-notes      "Notes Only"             support "On-site AV technician all day."
--   e-s2-req-all        "All Three"              needs, support and 1 x PA system
--   e-s2-req-none       "None Recorded"          nothing
--   e-s2-req-draft      "Draft With Everything"  DRAFT, all three sources

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "preferredLayout", "layoutNotes", "accessibilityRequirements",
  "accessibilityNotes", "programme", "equipmentNeeds", "technicalSupportNeeds", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-req-organiser', 'u-organiser', 'u-coordinator-a', 'Organiser Only', 'Purpose', 'Organiser Only - description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'THEATRE'::"RoomLayout", 'Stage at the front',
     ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'Ramp at the side entrance', E'09:00 Welcome\n10:00 Talks',
     'Six wireless mics.', NULL, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-req-rows', 'u-organiser', 'u-coordinator-a', 'Rows Only', 'Purpose', 'Rows Only - description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'THEATRE'::"RoomLayout", 'Stage at the front',
     ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'Ramp at the side entrance', E'09:00 Welcome\n10:00 Talks',
     NULL, NULL, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-req-notes', 'u-organiser', 'u-coordinator-a', 'Notes Only', 'Purpose', 'Notes Only - description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'THEATRE'::"RoomLayout", 'Stage at the front',
     ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'Ramp at the side entrance', E'09:00 Welcome\n10:00 Talks',
     NULL, 'On-site AV technician all day.', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-req-all', 'u-organiser', 'u-coordinator-a', 'All Three', 'Purpose', 'All Three - description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'THEATRE'::"RoomLayout", 'Stage at the front',
     ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'Ramp at the side entrance', E'09:00 Welcome\n10:00 Talks',
     'Mics and a projector.', 'Technician on call.', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-req-none', 'u-organiser', 'u-coordinator-a', 'None Recorded', 'Purpose', 'None Recorded - description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'THEATRE'::"RoomLayout", 'Stage at the front',
     ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'Ramp at the side entrance', E'09:00 Welcome\n10:00 Talks',
     NULL, NULL, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-req-draft', 'u-organiser', 'u-coordinator-a', 'Draft With Everything', 'Purpose', 'Draft With Everything - description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'THEATRE'::"RoomLayout", 'Stage at the front',
     ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'Ramp at the side entrance', E'09:00 Welcome\n10:00 Talks',
     'Six mics.', 'Technician.', 'DRAFT'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "EquipmentRequirement" ("id", "eventId", "equipmentType", "quantity", "notes", "createdAt", "updatedAt") VALUES
  ('rq-s2-rows-projector', 'e-s2-req-rows', 'Laser projector', 2, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('rq-s2-rows-mic', 'e-s2-req-rows', 'Wireless microphone', 6, 'Lapel', '2026-09-02 09:01:00', '2026-09-02 09:01:00'),
  ('rq-s2-all-pa', 'e-s2-req-all', 'PA system', 1, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('rq-s2-draft-pa', 'e-s2-req-draft', 'PA system', 1, NULL, '2026-09-02 09:00:00', '2026-09-02 09:00:00');
