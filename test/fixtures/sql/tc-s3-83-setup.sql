-- tc-s3-83-setup.sql: two more events in planning beside the Gala, with no bookings.
--
-- Pre-condition for every test in test/us44-release-on-cancel.e2e-spec.ts (TC-S3-83 to 87) (Story 44). Load AFTER tc-s3-54-setup.sql.
--
--   EVT-211 "Other" and EVT-212 "Next": PLANNING, USR-006 / USR-004, 1 Oct 2030 18:00-22:00 UTC, 120

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-211', 'USR-006', 'USR-004', 'Other', 'Celebrate', 'An evening', 'Social', '2030-10-01 18:00:00', '2030-10-01 22:00:00', 120, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-212', 'USR-006', 'USR-004', 'Next',  'Celebrate', 'An evening', 'Social', '2030-10-01 18:00:00', '2030-10-01 22:00:00', 120, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
