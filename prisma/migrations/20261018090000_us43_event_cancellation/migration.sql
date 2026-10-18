-- US-43: an Organiser cancels their event. Its venue bookings are released
-- (like US-33 does for equipment), its pending change request is closed, and
-- the Coordinator and registered Attendees are notified.
ALTER TYPE "BookingStatus" ADD VALUE 'RELEASED';
ALTER TYPE "ChangeRequestStatus" ADD VALUE 'CLOSED';
ALTER TYPE "NotificationType" ADD VALUE 'EVENT_CANCELLED';

-- When the booking was released, mirroring EquipmentReservation.releasedAt.
ALTER TABLE "VenueBooking" ADD COLUMN "releasedAt" TIMESTAMP(3);
