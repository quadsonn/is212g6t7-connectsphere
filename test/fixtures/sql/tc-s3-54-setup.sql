-- tc-s3-54-setup.sql: a second Venue Staff member with their own venue, a
-- venue nobody manages, and an event in planning.
--
-- Pre-condition for TC-S3-54 to TC-S3-58 and TC-S3-62 (Story 40). Load AFTER
-- base-users.sql and base-venues.sql. Main Hall (VEN-002) is managed by
-- USR-010 (base-venues.sql).
--
--   USR-016   VENUE_STAFF "Sam Staff" (sam.staff@example.com)
--   VEN-039   "East Annex", published, managed by USR-016
--   VEN-040   "Old Gym", published, managed by nobody
--   EVT-194   PLANNING "Gala", organiser USR-006, Coordinator USR-004,
--             1 Oct 2030 18:00-22:00 UTC, 120 expected

INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "createdAt", "updatedAt") VALUES
  ('USR-016', 'sam.staff@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Sam Staff', 'VENUE_STAFF'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "status", "createdAt", "updatedAt") VALUES
  ('VEN-039', 'East Annex', 'Level 1', 300, 'USR-016', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-040', 'Old Gym',    'Level 1', 300, NULL,      'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-194', 'USR-006', 'USR-004', 'Gala', 'Celebrate', 'An evening', 'Social',
     '2030-10-01 18:00:00', '2030-10-01 22:00:00', 120, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
