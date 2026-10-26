-- tc-s2-117-setup.sql: an event whose equipment and support text is only spaces.
--
-- Pre-condition for TC-S2-117 (Story 30 AC-3): blank text counts as nothing
-- recorded. Load AFTER base-users.sql and tc-s2-114-setup.sql.
--
--   EVT-116  "Blank Text", equipment needs '   ', support ' '

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "preferredLayout", "layoutNotes", "accessibilityRequirements",
  "accessibilityNotes", "programme", "equipmentNeeds", "technicalSupportNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-116', 'USR-006', 'USR-004', 'Blank Text', 'Purpose', 'Blank Text - description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'THEATRE'::"RoomLayout", 'Stage at the front',
     ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'Ramp at the side entrance', E'09:00 Welcome\n10:00 Talks',
     '   ', ' ', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
