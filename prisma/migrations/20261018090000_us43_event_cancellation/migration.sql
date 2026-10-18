-- US-43: an Organiser cancels their event. Its venue bookings are released
-- (like US-33 does for equipment), its pending change request is closed, and
-- the Coordinator and registered Attendees are notified.
-- IF NOT EXISTS: US-54 (sprint3-lh) already adds RELEASED and releasedAt for
-- released holds; on a database that has it, these two lines are no-ops.
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'RELEASED';
ALTER TYPE "ChangeRequestStatus" ADD VALUE 'CLOSED';
ALTER TYPE "NotificationType" ADD VALUE 'EVENT_CANCELLED';

-- When the booking was released, mirroring EquipmentReservation.releasedAt.
ALTER TABLE "VenueBooking" ADD COLUMN IF NOT EXISTS "releasedAt" TIMESTAMP(3);
