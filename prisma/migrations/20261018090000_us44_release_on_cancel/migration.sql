-- US-44: release venue bookings when their event is cancelled.
--
-- Additive: a BookingDecisionKind for the release, and BookingDecision's
-- decider becomes optional, so the system can record a release when the
-- cancellation has no known actor. Every existing row keeps its decider; the
-- foreign key is unchanged. RELEASED, releasedAt and releaseReason already
-- exist (US-54).

-- AlterEnum
ALTER TYPE "BookingDecisionKind" ADD VALUE IF NOT EXISTS 'RELEASE';

-- AlterTable
ALTER TABLE "BookingDecision" ALTER COLUMN "decidedById" DROP NOT NULL;
