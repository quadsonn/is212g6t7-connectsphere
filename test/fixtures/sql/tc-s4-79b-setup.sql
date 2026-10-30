-- tc-s4-79b-setup.sql: there are no Technical Support accounts at all.
--
-- Pre-condition for TC-S4-79 (the message shows with nobody to list). Load
-- AFTER tc-s4-76-setup.sql and before any event that names them.
--
--   USR-042, USR-043 removed

DELETE FROM "User" WHERE "id" IN ('USR-042', 'USR-043');
