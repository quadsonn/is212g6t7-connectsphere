-- US-33: a reservation released because its event was cancelled.
ALTER TYPE "ReservationStatus" ADD VALUE 'RELEASED';

-- US-33 AC-3: when the release happened, so Technical Support can see it.
ALTER TABLE "EquipmentReservation" ADD COLUMN "releasedAt" TIMESTAMP(3);
