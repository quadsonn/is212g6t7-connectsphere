-- Notify the Event Coordinator when equipment their event depends on becomes
-- unavailable or is released.
ALTER TYPE "NotificationType" ADD VALUE 'EQUIPMENT_UNAVAILABLE';
ALTER TYPE "NotificationType" ADD VALUE 'EQUIPMENT_RELEASED';
