-- AlterEnum
ALTER TYPE "EventStatus" ADD VALUE 'AWAITING_CLARIFICATION';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'CLARIFICATION_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'CLARIFICATION_ANSWERED';

-- CreateTable
CREATE TABLE "ClarificationMessage" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClarificationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClarificationMessage_eventId_createdAt_idx" ON "ClarificationMessage"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "ClarificationMessage_authorId_idx" ON "ClarificationMessage"("authorId");

-- AddForeignKey
ALTER TABLE "ClarificationMessage" ADD CONSTRAINT "ClarificationMessage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClarificationMessage" ADD CONSTRAINT "ClarificationMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
