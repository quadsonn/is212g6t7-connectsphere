-- US-16: blocked-out periods on a venue (maintenance, holidays).

-- CreateTable
CREATE TABLE "VenueBlock" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VenueBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VenueBlock_venueId_start_end_idx" ON "VenueBlock"("venueId", "start", "end");

-- CreateIndex
CREATE INDEX "VenueBlock_createdById_idx" ON "VenueBlock"("createdById");

-- AddForeignKey
ALTER TABLE "VenueBlock" ADD CONSTRAINT "VenueBlock_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueBlock" ADD CONSTRAINT "VenueBlock_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

