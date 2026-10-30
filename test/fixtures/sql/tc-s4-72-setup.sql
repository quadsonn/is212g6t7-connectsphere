-- tc-s4-72-setup.sql: neither venue has a capacity recorded.
--
-- Pre-condition for TC-S4-72 (no near-capacity notice when capacity is not
-- known). Load AFTER tc-s4-65-setup.sql. A published venue must have a
-- capacity (CHECK "Venue_complete_unless_draft"), so the only way a booked
-- venue can lack one is to have been taken back to draft.
--
--   VEN-083, VEN-084: DRAFT, capacity NULL (the bookings stay approved)

UPDATE "Venue" SET "status" = 'DRAFT'::"VenueStatus", "capacity" = NULL WHERE "id" IN ('VEN-083', 'VEN-084');
