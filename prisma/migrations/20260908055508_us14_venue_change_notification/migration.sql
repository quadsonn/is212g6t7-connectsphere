-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'VENUE_CHANGED_BOOKINGS_AFFECTED';

-- DropIndex
DROP INDEX "Venue_managedById_idx";
