-- tc-s2-33-setup.sql: events the requesting Coordinator must NOT be able to
-- check: another Coordinator's, an unassigned one, and inactive ones.
--
-- Pre-condition for TC-S2-33 (Story 19 access rules). Load AFTER base-users.sql
-- and tc-s2-28-setup.sql.
--
--   e-s2-theirs     APPROVED, assigned to u-coordinator-b
--   e-s2-pool       SUBMITTED, no coordinator (the review pool)
--   e-s2-rejected   REJECTED,  u-coordinator-a
--   e-s2-cancelled  CANCELLED, u-coordinator-a
--   e-s2-completed  COMPLETED, u-coordinator-a

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "accessibilityRequirements", "preferredLayout",
  "status", "createdAt", "updatedAt") VALUES
  ('e-s2-theirs', 'u-organiser', 'u-coordinator-b', 'Theirs', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 80, ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'THEATRE'::"RoomLayout",
     'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-pool', 'u-organiser', NULL, 'Pool', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 80, ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'THEATRE'::"RoomLayout",
     'SUBMITTED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-rejected', 'u-organiser', 'u-coordinator-a', 'Rejected', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 80, ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'THEATRE'::"RoomLayout",
     'REJECTED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-cancelled', 'u-organiser', 'u-coordinator-a', 'Cancelled', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 80, ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'THEATRE'::"RoomLayout",
     'CANCELLED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-completed', 'u-organiser', 'u-coordinator-a', 'Completed', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 80, ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'THEATRE'::"RoomLayout",
     'COMPLETED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
