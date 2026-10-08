-- US-23: an append-only log of venue booking decisions and reversals.

-- CreateEnum
CREATE TYPE "BookingDecisionKind" AS ENUM ('DECISION', 'REVERSAL');

-- CreateTable
CREATE TABLE "BookingDecision" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "decidedById" TEXT NOT NULL,
    "kind" "BookingDecisionKind" NOT NULL DEFAULT 'DECISION',
    "outcome" "BookingStatus" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingDecision_bookingId_createdAt_idx" ON "BookingDecision"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "BookingDecision_decidedById_idx" ON "BookingDecision"("decidedById");

-- AddForeignKey
ALTER TABLE "BookingDecision" ADD CONSTRAINT "BookingDecision_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "VenueBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingDecision" ADD CONSTRAINT "BookingDecision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

