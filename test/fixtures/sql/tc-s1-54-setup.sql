-- tc-s1-54-setup.sql: a SUBMITTED request with layout and accessibility
-- preferences, assigned to u-coordinator-a.
--
-- Pre-condition for TC-S1-54 (US-06 AC-6, updated for Week 7 Change 5: the
-- ASSIGNED Coordinator sees the values the Organiser entered). Load AFTER
-- base-users.sql. To be loaded by the US-12 integration tests when
-- events-coordinator-view.e2e-spec.ts is converted (group 3).
--
--   e-with-preferences  SUBMITTED, raised by u-organiser, assigned to u-coordinator-a.
--                       Values match the US-12 tests' expectations (equipment needs,
--                       registration enabled) so group 3 can load it unchanged.

INSERT INTO "EventRequest" (
  "id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance",
  "preferredLayout", "layoutNotes", "accessibilityRequirements", "accessibilityNotes",
  "equipmentNeeds", "registrationEnabled", "status", "createdAt", "updatedAt"
) VALUES (
  'e-with-preferences', 'u-organiser', 'u-coordinator-a',
  'Freshman Orientation 2030', 'Welcome new students and introduce campus services',
  'Full-day programme with talks, booths and a closing social', 'Student engagement',
  '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320,
  'THEATRE'::"RoomLayout", 'Centre aisle, front row reserved',
  ARRAY['STEP_FREE_ACCESS', 'HEARING_LOOP']::"AccessibilityFeature"[], 'Ramp access to the stage',
  'Six wireless microphones, two projectors', true, 'SUBMITTED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'
);
