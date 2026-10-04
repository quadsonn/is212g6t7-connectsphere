-- US-25: `programme` on EventRequest (AC-1), plus the flag vocabulary for
-- edits that touch already-confirmed arrangements (AC-2).
-- US-26: EventChange, the append-only change history.

-- CreateEnum
CREATE TYPE "ConfirmedArrangement" AS ENUM ('VENUE_BOOKING', 'EQUIPMENT_RESERVATION');

-- AlterTable
ALTER TABLE "EventRequest" ADD COLUMN     "programme" TEXT;

-- CreateTable
CREATE TABLE "EventChange" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "requiresReview" BOOLEAN NOT NULL DEFAULT false,
    "affectedArrangements" "ConfirmedArrangement"[] DEFAULT ARRAY[]::"ConfirmedArrangement"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventChange_eventId_createdAt_idx" ON "EventChange"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "EventChange_changedById_idx" ON "EventChange"("changedById");

-- AddForeignKey
ALTER TABLE "EventChange" ADD CONSTRAINT "EventChange_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventChange" ADD CONSTRAINT "EventChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

