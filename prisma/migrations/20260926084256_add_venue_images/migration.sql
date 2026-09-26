-- AlterTable
ALTER TABLE "Venue" ADD COLUMN     "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
