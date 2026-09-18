-- CreateEnum
CREATE TYPE "VenueStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- AlterTable
ALTER TABLE "Venue" ADD COLUMN     "status" "VenueStatus" NOT NULL DEFAULT 'DRAFT';
