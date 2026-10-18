-- tc-s2-29-setup.sql: an event that fails capacity by one and needs an
-- accessibility feature the venue lacks.
--
-- Pre-condition for TC-S2-29 (Story 19 AC-1/AC-2). Load AFTER base-users.sql
-- and tc-s2-28-setup.sql.
--
--   e-s2-misfit-one-over  APPROVED, u-coordinator-a, 101 expected (venue holds 100),
--                         needs STEP_FREE_ACCESS (met) and HEARING_LOOP (not met)

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "accessibilityRequirements", "preferredLayout",
  "status", "createdAt", "updatedAt") VALUES
  ('e-s2-misfit-one-over', 'u-organiser', 'u-coordinator-a', 'Misfit', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 101, ARRAY['STEP_FREE_ACCESS', 'HEARING_LOOP']::"AccessibilityFeature"[], 'THEATRE'::"RoomLayout",
     'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
