-- US-38: a Coordinator approves or rejects an Organiser's change request. The
-- decision is recorded on the request: who, when, and (for a rejection) why.

-- AlterTable
ALTER TABLE "EventChangeRequest" ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decidedById" TEXT,
ADD COLUMN     "decisionReason" TEXT;

-- CreateIndex
CREATE INDEX "EventChangeRequest_decidedById_idx" ON "EventChangeRequest"("decidedById");

-- AddForeignKey
ALTER TABLE "EventChangeRequest" ADD CONSTRAINT "EventChangeRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma cannot express CHECK constraints. A decided request says when it was
-- decided, and a rejection always says why.
ALTER TABLE "EventChangeRequest"
  ADD CONSTRAINT "EventChangeRequest_decided_has_time"
  CHECK ("status" = 'PENDING' OR "decidedAt" IS NOT NULL);

ALTER TABLE "EventChangeRequest"
  ADD CONSTRAINT "EventChangeRequest_rejected_has_reason"
  CHECK ("status" <> 'REJECTED' OR ("decisionReason" IS NOT NULL AND length(btrim("decisionReason")) > 0));
