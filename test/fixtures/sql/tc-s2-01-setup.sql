-- tc-s2-01-setup.sql: a second Venue Staff member with one published venue.
--
-- Pre-condition for TC-S2-01 (Story 16 AC-1), and for every Sprint 2 test case
-- that checks one staff member can't see or change another's venues.
-- Load AFTER base-users.sql (and base-venues.sql where the test case says so).
--
--   u-venue-staff-b  venue.staff.b@example.com  second VENUE_STAFF
--   v-other-hall     "Other Hall", PUBLISHED, managed by u-venue-staff-b

INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "createdAt", "updatedAt") VALUES
  ('u-venue-staff-b', 'venue.staff.b@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Victor Venue', 'VENUE_STAFF'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "supportedLayouts", "operatingInfo", "status", "createdAt", "updatedAt") VALUES
  ('v-other-hall', 'Other Hall', 'Block D, Level 2', 200, 'u-venue-staff-b',
     ARRAY['PROJECTOR']::"Facility"[], ARRAY[]::"AccessibilityFeature"[], ARRAY['THEATRE']::"RoomLayout"[],
     '8:00 AM – 10:00 PM', 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
