-- US-21: a venue booking request carries who asked for it, the expected
-- attendance, and a snapshot of the event's requirements.

-- AlterTable
ALTER TABLE "VenueBooking" ADD COLUMN     "accessibilityNotes" TEXT,
ADD COLUMN     "accessibilityRequirements" "AccessibilityFeature"[] DEFAULT ARRAY[]::"AccessibilityFeature"[],
ADD COLUMN     "equipmentNeeds" TEXT,
ADD COLUMN     "expectedAttendance" INTEGER,
ADD COLUMN     "layoutNotes" TEXT,
ADD COLUMN     "preferredLayout" "RoomLayout",
ADD COLUMN     "requestedById" TEXT;

-- Backfill: bookings created before US-21 are attributed to the event's
-- coordinator, the only role that can raise one.
UPDATE "VenueBooking" b
SET "requestedById" = e."coordinatorId",
    "expectedAttendance" = e."expectedAttendance"
FROM "EventRequest" e
WHERE b."eventId" = e."id";

-- CreateIndex
CREATE INDEX "VenueBooking_requestedById_idx" ON "VenueBooking"("requestedById");

-- AddForeignKey
ALTER TABLE "VenueBooking" ADD CONSTRAINT "VenueBooking_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
