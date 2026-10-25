-- US-58 AC4: an Organiser's clarification response may update the request's
-- details. Those edits are recorded once, as the event's history entry
-- (EventChange, US-26); the response links to it so the thread can show the
-- changes beside the answer. Null for questions and for text-only answers.
-- Adds a column only: no existing row changes.
ALTER TABLE "ClarificationMessage" ADD COLUMN "changeId" TEXT;

-- One history entry belongs to at most one response.
CREATE UNIQUE INDEX "ClarificationMessage_changeId_key" ON "ClarificationMessage"("changeId");

-- Losing the history entry keeps the response, without its changes.
ALTER TABLE "ClarificationMessage" ADD CONSTRAINT "ClarificationMessage_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "EventChange"("id") ON DELETE SET NULL ON UPDATE CASCADE;
