-- CreateEnum
CREATE TYPE "SafetyOutcome" AS ENUM ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "SafetyReturnStage" AS ENUM ('VENUE', 'TECHNICAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EventStatus" ADD VALUE 'AWAITING_SAFETY_CHECK';
ALTER TYPE "EventStatus" ADD VALUE 'SAFETY_REJECTED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SAFETY_CHECK_DECIDED';

-- AlterTable
ALTER TABLE "EventRequest" ADD COLUMN     "safetyQueuedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SafetyReview" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "officerId" TEXT NOT NULL,
    "outcome" "SafetyOutcome" NOT NULL,
    "reason" TEXT,
    "returnStage" "SafetyReturnStage",
    "emergencyAccessComment" TEXT,
    "crowdMovementComment" TEXT,
    "equipmentPlacementComment" TEXT,
    "accessibilityComment" TEXT,
    "affectedArrangements" "ConfirmedArrangement"[] DEFAULT ARRAY[]::"ConfirmedArrangement"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafetyReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SafetyReview_eventId_createdAt_idx" ON "SafetyReview"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "SafetyReview_officerId_idx" ON "SafetyReview"("officerId");

-- AddForeignKey
ALTER TABLE "SafetyReview" ADD CONSTRAINT "SafetyReview_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyReview" ADD CONSTRAINT "SafetyReview_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A rejection or a request for changes must say why; an approval need not.
ALTER TABLE "SafetyReview" ADD CONSTRAINT "SafetyReview_reason_required"
  CHECK ("outcome" = 'APPROVED' OR ("reason" IS NOT NULL AND btrim("reason") <> ''));

-- The stage to return to is recorded exactly when changes are requested.
ALTER TABLE "SafetyReview" ADD CONSTRAINT "SafetyReview_return_stage_matches_outcome"
  CHECK (("outcome" = 'CHANGES_REQUESTED') = ("returnStage" IS NOT NULL));
