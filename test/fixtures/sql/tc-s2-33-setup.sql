-- tc-s2-33-setup.sql: events the requesting Coordinator must NOT be able to
-- check: another Coordinator's, an unassigned one, and inactive ones.
--
-- Pre-condition for TC-S2-33 (Story 19 access rules). Load AFTER base-users.sql
-- and tc-s2-28-setup.sql.
--
--   EVT-126     APPROVED, assigned to USR-005
--   EVT-106       SUBMITTED, no coordinator (the review pool)
--   EVT-113   REJECTED,  USR-004
--   EVT-059  CANCELLED, USR-004
--   EVT-061  COMPLETED, USR-004

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "accessibilityRequirements", "preferredLayout",
  "status", "createdAt", "updatedAt") VALUES
  ('EVT-126', 'USR-006', 'USR-005', 'Theirs', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 80, ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'THEATRE'::"RoomLayout",
     'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-106', 'USR-006', NULL, 'Pool', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 80, ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'THEATRE'::"RoomLayout",
     'SUBMITTED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-113', 'USR-006', 'USR-004', 'Rejected', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 80, ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'THEATRE'::"RoomLayout",
     'REJECTED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-059', 'USR-006', 'USR-004', 'Cancelled', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 80, ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'THEATRE'::"RoomLayout",
     'CANCELLED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-061', 'USR-006', 'USR-004', 'Completed', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 80, ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'THEATRE'::"RoomLayout",
     'COMPLETED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
