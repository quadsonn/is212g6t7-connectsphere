-- tc-s3-70-setup.sql: an event in planning, its venues and a projector, with nothing booked yet.
--
-- Pre-condition for every test in test/events-confirm.e2e-spec.ts (TC-S3-70 to 74) (Story 42). Load AFTER base-users.sql.
--
--   EVT-203   PLANNING "Graduation showcase", organiser USR-006, Coordinator USR-004,
--             1 Nov 2030 10:00-14:00 UTC, 120 expected
--   VEN-057 Hall A, VEN-058 Room 2, VEN-059 Annex (300, managed by USR-010)
--   EQP-013   Projector, 10 in stock

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-203', 'USR-006', 'USR-004', 'Graduation showcase', 'Celebration', 'Final-year projects on show', 'Academic',
     '2030-11-01 10:00:00', '2030-11-01 14:00:00', 120, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "status", "createdAt", "updatedAt") VALUES
  ('VEN-057', 'Hall A', 'School of Computing', 300, 'USR-010', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-058', 'Room 2', 'School of Computing', 300, 'USR-010', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-059', 'Annex',  'School of Computing', 300, 'USR-010', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "Equipment" ("id", "type", "totalQuantity", "createdAt", "updatedAt") VALUES
  ('EQP-013', 'Projector', 10, '2026-09-01 09:00:00', '2026-09-01 09:00:00');
