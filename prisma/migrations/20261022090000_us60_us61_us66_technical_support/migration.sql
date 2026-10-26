-- US-60, US-61, US-66: Technical Support assignment and notifications.
--
-- Additive only. One nullable column on EventRequest (US-61's assignee),
-- one nullable reference from a notification to an equipment item (US-60),
-- and four NotificationType values. Existing rows keep every value; their
-- new columns are null.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EQUIPMENT_STATUS_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EQUIPMENT_REQUEST_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EQUIPMENT_EVENT_CANCELLED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EQUIPMENT_RESERVATIONS_REBOOKED';

-- AlterTable
ALTER TABLE "EventRequest" ADD COLUMN "technicalSupportId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "relatedEquipmentId" TEXT;

-- CreateIndex
CREATE INDEX "EventRequest_technicalSupportId_idx" ON "EventRequest"("technicalSupportId");
CREATE INDEX "Notification_relatedEquipmentId_idx" ON "Notification"("relatedEquipmentId");

-- AddForeignKey
ALTER TABLE "EventRequest" ADD CONSTRAINT "EventRequest_technicalSupportId_fkey"
  FOREIGN KEY ("technicalSupportId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_relatedEquipmentId_fkey"
  FOREIGN KEY ("relatedEquipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
