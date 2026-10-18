-- tc-s2-31-setup.sql: an event the venue clearly doesn't suit, so the
-- suitability check flags it before a booking request is submitted.
--
-- Pre-condition for TC-S2-31 (Story 19 AC-5). Load AFTER base-users.sql and
-- tc-s2-28-setup.sql.
--
--   e-s2-misfit-large  APPROVED, u-coordinator-a, 500 expected (venue holds 100),
--                      needs HEARING_LOOP (not met)

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "accessibilityRequirements", "preferredLayout",
  "status", "createdAt", "updatedAt") VALUES
  ('e-s2-misfit-large', 'u-organiser', 'u-coordinator-a', 'Misfit', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 500, ARRAY['HEARING_LOOP']::"AccessibilityFeature"[], 'THEATRE'::"RoomLayout",
     'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
