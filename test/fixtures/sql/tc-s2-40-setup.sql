-- tc-s2-40-setup.sql: an event that has only been SUBMITTED, so no venue may
-- be requested for it yet.
--
-- Pre-condition for TC-S2-40 (Story 20 access rules). Load AFTER base-users.sql,
-- base-venues.sql, tc-s2-01-setup.sql and tc-s2-34-setup.sql.
--
--   EVT-095  SUBMITTED "Not approved yet", USR-004

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "preferredLayout", "accessibilityRequirements",
  "accessibilityNotes", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-095', 'USR-006', 'USR-004', 'Not approved yet', 'Welcome', 'Programme', 'Student engagement',
     '2030-10-01 09:00:00', '2030-10-01 12:00:00', 120, 'THEATRE'::"RoomLayout",
     ARRAY['HEARING_LOOP']::"AccessibilityFeature"[], 'Two hearing aid users', '2 wireless mics',
     'SUBMITTED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
