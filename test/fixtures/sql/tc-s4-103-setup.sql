-- tc-s4-103-setup.sql: the Organiser is also registered for her own event.
--
-- Pre-condition for TC-S4-103. Load AFTER tc-s4-102-setup.sql. Only Attendees
-- can register through the API, but such a row can exist in the data.
--
--   REG-021 Olivia (USR-006) REGISTERED for EVT-311

INSERT INTO "Registration" ("id", "eventId", "attendeeId", "status", "phone", "createdAt", "updatedAt") VALUES
  ('REG-021', 'EVT-311', 'USR-006', 'REGISTERED'::"RegistrationStatus", '+6598765432', '2026-09-05 09:00:00', '2026-09-05 09:00:00');
