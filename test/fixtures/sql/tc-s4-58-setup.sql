-- tc-s4-58-setup.sql: the Coordinator has asked a question on the Organiser's request.
--
-- Pre-condition for the Story 58 browser test (e2e/us58-clarification-response.spec.ts).
-- Load AFTER base-users.sql and tc-s1-01-setup.sql ("Freshman Orientation 2030",
-- EVT-146, SUBMITTED, Olivia's, assigned to Cody, 320 people).
--
--   EVT-146: AWAITING_CLARIFICATION, question "How many will attend, and how will they leave?"
--   CLM-002: that question, from Cody (USR-004)

UPDATE "EventRequest"
   SET "status" = 'AWAITING_CLARIFICATION'::"EventStatus",
       "clarificationRequest" = 'How many will attend, and how will they leave?'
 WHERE "id" = 'EVT-146';

INSERT INTO "ClarificationMessage" ("id", "eventId", "authorId", "body", "createdAt") VALUES
  ('CLM-002', 'EVT-146', 'USR-004', 'How many will attend, and how will they leave?', '2026-09-03 09:00:00');
