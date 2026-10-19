-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'EVENT_ASSIGNED';

-- AlterTable
ALTER TABLE "EventRequest" ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "organisation" TEXT;

-- CreateIndex
CREATE INDEX "EventRequest_coordinatorId_submittedAt_idx" ON "EventRequest"("coordinatorId", "submittedAt");

-- Backfill: no earlier story recorded when a request was submitted. updatedAt
-- is the closest stand-in for events that have left DRAFT, so the unassigned
-- queue has a sort key for them; drafts stay null.
UPDATE "EventRequest" SET "submittedAt" = "updatedAt" WHERE "status" <> 'DRAFT';
