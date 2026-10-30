-- tc-s1-96-setup.sql: a second Venue Staff member, for US-13 to US-15.
--
-- Pre-condition for TC-S1-99 (US-13 AC-4: a draft is visible only to its
-- manager), TC-S1-103 (US-14 AC-1: another manager's venue can't be edited)
-- and TC-S1-108 (US-15). Load AFTER base-users.sql. USR-010 (base-users.sql)
-- manages every venue in base-venues.sql; USR-013 manages none.
--
--   USR-013  venue.staff2@example.com  "Vince Venue"  VENUE_STAFF

INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "createdAt", "updatedAt") VALUES
  ('USR-013', 'venue.staff2@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Vince Venue', 'VENUE_STAFF'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
