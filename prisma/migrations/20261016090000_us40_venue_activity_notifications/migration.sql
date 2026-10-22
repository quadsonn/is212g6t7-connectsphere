-- US-40: venue activity notifications for Venue Staff.
--
-- Additive only: five new NotificationType values, and a nullable reference
-- from a notification to the booking request it is about (AC-3). Existing
-- notifications keep every value; their relatedBookingId is null.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BOOKING_REQUEST_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BOOKING_DETAILS_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BOOKING_EVENT_CANCELLED';
-- Sent by US-54 (tentative holds), which is not built yet.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'HOLD_EXPIRING';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'HOLD_EXPIRED';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "relatedBookingId" TEXT;

-- CreateIndex
CREATE INDEX "Notification_relatedBookingId_idx" ON "Notification"("relatedBookingId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_relatedBookingId_fkey"
  FOREIGN KEY ("relatedBookingId") REFERENCES "VenueBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
