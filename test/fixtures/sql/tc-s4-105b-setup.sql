-- tc-s4-105b-setup.sql: the Organiser asks to move the Town Hall a day later.
--
-- Pre-condition for TC-S4-105. Load AFTER tc-s4-104-setup.sql; the test then
-- approves it through the API.
--
--   CRQ-019 PENDING from Olga: "The keynote speaker moved.", to 2 Oct 2030 10:00-12:00 UTC

INSERT INTO "EventChangeRequest" ("id", "eventId", "requestedById", "status", "reason", "proposedStart", "proposedEnd", "createdAt", "updatedAt") VALUES
  ('CRQ-019', 'EVT-312', 'USR-038', 'PENDING'::"ChangeRequestStatus", 'The keynote speaker moved.', '2030-10-02 10:00:00', '2030-10-02 12:00:00', '2026-09-04 09:00:00', '2026-09-04 09:00:00');
