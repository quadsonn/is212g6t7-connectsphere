-- CreateEnum
CREATE TYPE "EquipmentStatus" AS ENUM ('OPERATIONAL', 'UNDER_MAINTENANCE', 'OUT_OF_SERVICE');

-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "description" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "operationalStatus" "EquipmentStatus" NOT NULL DEFAULT 'OPERATIONAL';
