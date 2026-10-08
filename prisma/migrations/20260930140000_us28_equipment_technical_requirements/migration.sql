-- US-28: equipment requirements (AC-1) and technical support needs (AC-2)
-- recorded against an event during planning.

-- AlterTable
ALTER TABLE "EventRequest" ADD COLUMN     "technicalSupportNeeds" TEXT;

-- CreateTable
CREATE TABLE "EquipmentRequirement" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "equipmentType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquipmentRequirement_eventId_idx" ON "EquipmentRequirement"("eventId");

-- AddForeignKey
ALTER TABLE "EquipmentRequirement" ADD CONSTRAINT "EquipmentRequirement_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Prisma cannot express CHECK constraints; a requirement for zero or fewer
-- of something is meaningless.
ALTER TABLE "EquipmentRequirement"
  ADD CONSTRAINT "EquipmentRequirement_quantity_positive" CHECK ("quantity" > 0);
