-- Notify Attendees when registration opens, closes, or nears capacity.

-- Three one-time notices.
ALTER TYPE "NotificationType" ADD VALUE 'REGISTRATION_OPENED';
ALTER TYPE "NotificationType" ADD VALUE 'REGISTRATION_CLOSED';
ALTER TYPE "NotificationType" ADD VALUE 'REGISTRATION_NEAR_CAPACITY';

-- One "already sent" stamp per notice, so the sweep that detects these moments
-- fires each exactly once per event.
ALTER TABLE "EventRequest"
  ADD COLUMN "registrationOpenedNotifiedAt"       TIMESTAMP(3),
  ADD COLUMN "registrationClosedNotifiedAt"       TIMESTAMP(3),
  ADD COLUMN "registrationNearCapacityNotifiedAt" TIMESTAMP(3);

-- Backfill: an event that is already CONFIRMED (or COMPLETED) opened before
-- this feature existed, so mark its "opened" notice as sent — otherwise the
-- first sweep would announce "registration is now open" for every existing
-- event to every attendee. The "closes" and "near capacity" notices are left
-- unsent: they go only to an event's own registered attendees and fire from
-- the event's current state, so the feature simply takes effect from now on.
UPDATE "EventRequest"
   SET "registrationOpenedNotifiedAt" = now()
 WHERE "status" IN ('CONFIRMED', 'COMPLETED');
