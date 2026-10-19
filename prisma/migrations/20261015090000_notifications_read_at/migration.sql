-- Notifications page: when a notification was read, and an index for a
-- recipient's inbox, newest first. Additive only; existing rows are unread
-- (readAt null) or already read (read = true, readAt null), unchanged.

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "readAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Notification_recipientId_createdAt_idx" ON "Notification"("recipientId", "createdAt");
