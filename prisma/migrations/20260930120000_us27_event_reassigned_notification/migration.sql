-- US-27 AC-3: notify both Coordinators when an event is reassigned.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'EVENT_REASSIGNED';
