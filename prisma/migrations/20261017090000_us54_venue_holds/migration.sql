-- US-54: tentative venue holds with expiry.
--
-- Additive only: two BookingStatus values, two NotificationType values, the
-- hold columns on VenueBooking and an index for the expiry job. No existing
-- row changes; every existing booking gets NULL in the new columns.
--
-- The constraint change that makes HELD hard-block is the next migration
-- (20261017090100_us54_exclude_approved_and_held): Postgres cannot use an
-- enum value in the same transaction that adds it.

-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'HELD';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'RELEASED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'HOLD_PLACED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'HOLD_RELEASED';

-- AlterTable
ALTER TABLE "VenueBooking"
  ADD COLUMN "holdExpiresAt"     TIMESTAMP(3),
  ADD COLUMN "heldById"          TEXT,
  ADD COLUMN "holdWarningSentAt" TIMESTAMP(3),
  ADD COLUMN "releasedAt"        TIMESTAMP(3),
  ADD COLUMN "releaseReason"     TEXT;

-- CreateIndex
CREATE INDEX "VenueBooking_status_holdExpiresAt_idx" ON "VenueBooking"("status", "holdExpiresAt");

-- AddForeignKey
ALTER TABLE "VenueBooking" ADD CONSTRAINT "VenueBooking_heldById_fkey"
  FOREIGN KEY ("heldById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
