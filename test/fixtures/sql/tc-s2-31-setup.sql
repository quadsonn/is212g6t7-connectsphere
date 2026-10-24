-- tc-s2-31-setup.sql: an event the venue clearly doesn't suit, so the
-- suitability check flags it before a booking request is submitted.
--
-- Pre-condition for TC-S2-31 (Story 19 AC-5). Load AFTER base-users.sql and
-- tc-s2-28-setup.sql.
--
--   EVT-091  APPROVED, USR-004, 80 expected (venue holds 100, so capacity
--            is met: an over-capacity request is refused outright, not flagged),
--            needs HEARING_LOOP (not met), so the check reports NOT_SUITABLE

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "accessibilityRequirements", "preferredLayout",
  "status", "createdAt", "updatedAt") VALUES
  ('EVT-091', 'USR-006', 'USR-004', 'Misfit', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 80, ARRAY['HEARING_LOOP']::"AccessibilityFeature"[], 'THEATRE'::"RoomLayout",
     'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
