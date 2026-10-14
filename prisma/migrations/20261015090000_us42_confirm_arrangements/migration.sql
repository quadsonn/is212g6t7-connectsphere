-- US-42 — the Coordinator confirms an event's arrangements are ready.
--
-- Additive only. Existing events and equipment lines get nulls in the new
-- columns: nothing was confirmed or manually checked before this story. No
-- existing value is converted or discarded.
--
-- IF NOT EXISTS: US-57 (sprint3-felecia) adds the same status value in its own
-- migration; whichever runs second is a no-op.

ALTER TYPE "EventStatus" ADD VALUE IF NOT EXISTS 'AWAITING_SAFETY_CHECK' BEFORE 'CONFIRMED';

ALTER TABLE "EventRequest"
  ADD COLUMN "arrangementsConfirmedAt"   TIMESTAMP(3),
  ADD COLUMN "arrangementsConfirmedById" TEXT;

ALTER TABLE "EventRequest"
  ADD CONSTRAINT "EventRequest_arrangementsConfirmedById_fkey"
  FOREIGN KEY ("arrangementsConfirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EquipmentRequirement"
  ADD COLUMN "manuallyConfirmedAt"   TIMESTAMP(3),
  ADD COLUMN "manuallyConfirmedById" TEXT;

ALTER TABLE "EquipmentRequirement"
  ADD CONSTRAINT "EquipmentRequirement_manuallyConfirmedById_fkey"
  FOREIGN KEY ("manuallyConfirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
