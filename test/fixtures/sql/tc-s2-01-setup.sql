-- tc-s2-01-setup.sql: a second Venue Staff member with one published venue.
--
-- Pre-condition for TC-S2-01 (Story 16 AC-1), and for every Sprint 2 test case
-- that checks one staff member can't see or change another's venues.
-- Load AFTER base-users.sql (and base-venues.sql where the test case says so).
--
--   USR-011  venue.staff.b@example.com  second VENUE_STAFF
--   VEN-003     "Other Hall", PUBLISHED, managed by USR-011

INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "createdAt", "updatedAt") VALUES
  ('USR-011', 'venue.staff.b@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Victor Venue', 'VENUE_STAFF'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "supportedLayouts", "operatingInfo", "status", "createdAt", "updatedAt") VALUES
  ('VEN-003', 'Other Hall', 'Block D, Level 2', 200, 'USR-011',
     ARRAY['PROJECTOR']::"Facility"[], ARRAY[]::"AccessibilityFeature"[], ARRAY['THEATRE']::"RoomLayout"[],
     '8:00 AM – 10:00 PM', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
