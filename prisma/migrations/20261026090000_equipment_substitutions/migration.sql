-- Equipment substitutions: when Technical Support takes an item out of service
-- and it is reserved for a CONFIRMED event, they suggest a replacement (or say
-- there is none); the Coordinator accepts or declines.
--
-- Additive only: one enum, two NotificationType values, one table. No existing
-- row changes.

-- CreateEnum
CREATE TYPE "SubstitutionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'VOID');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EQUIPMENT_SUBSTITUTE_SUGGESTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EQUIPMENT_SUBSTITUTE_DECIDED';

-- CreateTable
CREATE TABLE "EquipmentSubstitution" (
    "id" TEXT NOT NULL DEFAULT next_readable_id('SUB'::text),
    "reservationId" TEXT NOT NULL,
    "alternativeEquipmentId" TEXT,
    "status" "SubstitutionStatus" NOT NULL DEFAULT 'PENDING',
    "suggestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "resultReservationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentSubstitution_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EquipmentSubstitution_readable_id" CHECK ("id" ~ '^SUB-[0-9]{3,}$')
);

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentSubstitution_resultReservationId_key" ON "EquipmentSubstitution"("resultReservationId");
CREATE INDEX "EquipmentSubstitution_reservationId_idx" ON "EquipmentSubstitution"("reservationId");
CREATE INDEX "EquipmentSubstitution_alternativeEquipmentId_idx" ON "EquipmentSubstitution"("alternativeEquipmentId");
CREATE INDEX "EquipmentSubstitution_status_idx" ON "EquipmentSubstitution"("status");

-- One live substitution per reservation: a pending, accepted or declined one
-- closes the question. Only a VOID one (the incident ended) makes room for a
-- new one. Prisma's schema language cannot express a partial index.
CREATE UNIQUE INDEX "EquipmentSubstitution_one_live_per_reservation"
  ON "EquipmentSubstitution"("reservationId") WHERE "status" <> 'VOID';

-- A decided substitution says who decided and when; an accepted one had a real
-- alternative. (resultReservationId is not required: its foreign key is
-- ON DELETE SET NULL, so deleting that reservation must stay possible.)
ALTER TABLE "EquipmentSubstitution" ADD CONSTRAINT "EquipmentSubstitution_decided_chk" CHECK (
  ("status" IN ('PENDING', 'VOID') OR ("decidedById" IS NOT NULL AND "decidedAt" IS NOT NULL))
  AND ("status" <> 'ACCEPTED' OR "alternativeEquipmentId" IS NOT NULL)
);

-- AddForeignKey
ALTER TABLE "EquipmentSubstitution" ADD CONSTRAINT "EquipmentSubstitution_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "EquipmentReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EquipmentSubstitution" ADD CONSTRAINT "EquipmentSubstitution_alternativeEquipmentId_fkey"
  FOREIGN KEY ("alternativeEquipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EquipmentSubstitution" ADD CONSTRAINT "EquipmentSubstitution_suggestedById_fkey"
  FOREIGN KEY ("suggestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EquipmentSubstitution" ADD CONSTRAINT "EquipmentSubstitution_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EquipmentSubstitution" ADD CONSTRAINT "EquipmentSubstitution_resultReservationId_fkey"
  FOREIGN KEY ("resultReservationId") REFERENCES "EquipmentReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
