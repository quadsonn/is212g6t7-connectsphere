-- US-37: an Organiser's request to change an event's dates, attendance or
-- equipment, saved as PENDING and linked to the event. Also links equipment
-- requirements to the catalogue so a proposed equipment list can be compared
-- with what the event currently has.

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "EquipmentRequirement" ADD COLUMN     "equipmentId" TEXT;

-- CreateTable
CREATE TABLE "EventChangeRequest" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "proposedStart" TIMESTAMP(3),
    "proposedEnd" TIMESTAMP(3),
    "proposedAttendance" INTEGER,
    "equipmentChanged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventChangeRequestEquipment" (
    "id" TEXT NOT NULL,
    "changeRequestId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "EventChangeRequestEquipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquipmentRequirement_equipmentId_idx" ON "EquipmentRequirement"("equipmentId");

-- CreateIndex
CREATE INDEX "EventChangeRequest_eventId_status_idx" ON "EventChangeRequest"("eventId", "status");

-- CreateIndex
CREATE INDEX "EventChangeRequest_requestedById_idx" ON "EventChangeRequest"("requestedById");

-- CreateIndex
CREATE INDEX "EventChangeRequestEquipment_equipmentId_idx" ON "EventChangeRequestEquipment"("equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "EventChangeRequestEquipment_changeRequestId_equipmentId_key" ON "EventChangeRequestEquipment"("changeRequestId", "equipmentId");

-- AddForeignKey
ALTER TABLE "EquipmentRequirement" ADD CONSTRAINT "EquipmentRequirement_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventChangeRequest" ADD CONSTRAINT "EventChangeRequest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventChangeRequest" ADD CONSTRAINT "EventChangeRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventChangeRequestEquipment" ADD CONSTRAINT "EventChangeRequestEquipment_changeRequestId_fkey" FOREIGN KEY ("changeRequestId") REFERENCES "EventChangeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventChangeRequestEquipment" ADD CONSTRAINT "EventChangeRequestEquipment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma cannot express CHECK constraints or partial indexes.
ALTER TABLE "EventChangeRequestEquipment"
  ADD CONSTRAINT "EventChangeRequestEquipment_quantity_positive" CHECK ("quantity" > 0);

-- One undecided request per event.
CREATE UNIQUE INDEX "EventChangeRequest_one_pending_per_event"
  ON "EventChangeRequest"("eventId") WHERE "status" = 'PENDING';

-- Backfill: link existing requirements to the catalogue by type, ignoring
-- case. Only an unambiguous match is linked; a type that matches several
-- catalogue items, or none, stays NULL and is left out of change-request
-- comparisons.
UPDATE "EquipmentRequirement" AS r
SET "equipmentId" = m."id"
FROM (
  SELECT lower("type") AS "type", min("id") AS "id"
  FROM "Equipment"
  GROUP BY lower("type")
  HAVING count(*) = 1
) AS m
WHERE lower(r."equipmentType") = m."type";
