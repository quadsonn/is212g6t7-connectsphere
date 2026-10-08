-- Requirement changes 5 and 6: two new internal roles. Additive only.

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'EVENT_COORDINATOR_LEAD';
ALTER TYPE "Role" ADD VALUE 'SAFETY_OFFICER';
