-- tc-s3-130-setup.sql: a venue with the customer's buffers, one with none, and two events.
--
-- Pre-condition for every test in test/venues-buffers.e2e-spec.ts (TC-S3-130 to 134) (Story 50). Load AFTER base-users.sql.
-- Times are UTC on 1 Oct 2030 unless stated.
--
--   VEN-068 hall (setup 30, turnaround 45 min), VEN-069 plain (0, 0), both managed by USR-010
--   EVT-253 "existing" and EVT-254 "newEvent": PLANNING, USR-006 / USR-004, 10:00-12:00

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "setupMinutes", "turnaroundMinutes", "status", "createdAt", "updatedAt") VALUES
  ('VEN-068', 'hall', 'Campus', 200, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 30, 45, 'PUBLISHED'::"VenueStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('VEN-069', 'plain', 'Campus', 200, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 0, 0, 'PUBLISHED'::"VenueStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-253', 'USR-006', 'USR-004', 'existing', 'p', 'd', 'c', '2030-10-01 10:00:00', '2030-10-01 12:00:00', 50, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-254', 'USR-006', 'USR-004', 'newEvent', 'p', 'd', 'c', '2030-10-01 10:00:00', '2030-10-01 12:00:00', 50, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
