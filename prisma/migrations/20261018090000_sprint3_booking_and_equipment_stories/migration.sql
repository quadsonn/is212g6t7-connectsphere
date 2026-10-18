-- Sprint 3: the schema for US-41, US-45, US-48, US-50 and US-52, in one
-- migration (collapsed from six per-story migrations before any was shared),
-- plus readable IDs for the two new tables. Additive only: no existing row,
-- column or constraint is changed or removed.

-- ===========================================================================
-- US-45: Technical Support marks equipment damaged or under maintenance, and
-- back to available, giving a reason each time. EquipmentStatusChange is the
-- append-only record of those changes.
-- ===========================================================================
-- CreateTable
CREATE TABLE "EquipmentStatusChange" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "fromStatus" "EquipmentStatus" NOT NULL,
    "toStatus" "EquipmentStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquipmentStatusChange_equipmentId_changedAt_idx" ON "EquipmentStatusChange"("equipmentId", "changedAt");

-- CreateIndex
CREATE INDEX "EquipmentStatusChange_changedById_idx" ON "EquipmentStatusChange"("changedById");

-- AddForeignKey
ALTER TABLE "EquipmentStatusChange" ADD CONSTRAINT "EquipmentStatusChange_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentStatusChange" ADD CONSTRAINT "EquipmentStatusChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma cannot express CHECK constraints. AC-2: a change is never saved
-- without a reason. And a change must change something.
ALTER TABLE "EquipmentStatusChange"
  ADD CONSTRAINT "EquipmentStatusChange_has_reason"
  CHECK (length(btrim("reason")) > 0);

ALTER TABLE "EquipmentStatusChange"
  ADD CONSTRAINT "EquipmentStatusChange_changes_status"
  CHECK ("fromStatus" <> "toStatus");

-- ===========================================================================
-- US-41: Venue Staff suggest alternative venues when rejecting a booking
-- request. One row per suggested venue, tied to the rejecting decision so the
-- suggestions appear in the request's history.
-- ===========================================================================
-- CreateTable
CREATE TABLE "BookingSuggestion" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "acceptedBookingId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingSuggestion_acceptedBookingId_key" ON "BookingSuggestion"("acceptedBookingId");

-- CreateIndex
CREATE INDEX "BookingSuggestion_bookingId_idx" ON "BookingSuggestion"("bookingId");

-- CreateIndex
CREATE INDEX "BookingSuggestion_venueId_idx" ON "BookingSuggestion"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingSuggestion_decisionId_venueId_key" ON "BookingSuggestion"("decisionId", "venueId");

-- AddForeignKey
ALTER TABLE "BookingSuggestion" ADD CONSTRAINT "BookingSuggestion_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "VenueBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSuggestion" ADD CONSTRAINT "BookingSuggestion_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "BookingDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSuggestion" ADD CONSTRAINT "BookingSuggestion_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSuggestion" ADD CONSTRAINT "BookingSuggestion_acceptedBookingId_fkey" FOREIGN KEY ("acceptedBookingId") REFERENCES "VenueBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===========================================================================
-- US-52: a booked venue becomes unavailable. The affected booking is marked
-- as needing a replacement, a replacement request links back to it, and
-- approving the replacement releases the original (new RELEASED status; the
-- record is kept and linked).
-- ===========================================================================
-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'RELEASED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'VENUE_UNAVAILABLE';

-- AlterTable
ALTER TABLE "VenueBooking" ADD COLUMN     "releasedAt" TIMESTAMP(3),
ADD COLUMN     "replacedByBookingId" TEXT,
ADD COLUMN     "replacementNeededAt" TIMESTAMP(3),
ADD COLUMN     "replacesBookingId" TEXT,
ADD COLUMN     "unavailableFrom" TIMESTAMP(3),
ADD COLUMN     "unavailableReason" TEXT,
ADD COLUMN     "unavailableUntil" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "VenueBooking_replacedByBookingId_key" ON "VenueBooking"("replacedByBookingId");

-- CreateIndex
CREATE INDEX "VenueBooking_replacesBookingId_idx" ON "VenueBooking"("replacesBookingId");

-- AddForeignKey
ALTER TABLE "VenueBooking" ADD CONSTRAINT "VenueBooking_replacesBookingId_fkey" FOREIGN KEY ("replacesBookingId") REFERENCES "VenueBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueBooking" ADD CONSTRAINT "VenueBooking_replacedByBookingId_fkey" FOREIGN KEY ("replacedByBookingId") REFERENCES "VenueBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===========================================================================
-- US-50 (Week 7 change 1): each venue's setup time before a booking and
-- turnaround time after it, in minutes. Default 0 = no buffer, so every
-- existing venue and booking behaves exactly as before. Configuring them is
-- #54.
-- ===========================================================================
-- AlterTable
ALTER TABLE "Venue" ADD COLUMN     "setupMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "turnaroundMinutes" INTEGER NOT NULL DEFAULT 0;

-- Prisma cannot express CHECK constraints. A negative buffer would shrink a
-- booking's occupied window below its own event time.
ALTER TABLE "Venue"
  ADD CONSTRAINT "Venue_buffers_not_negative"
  CHECK ("setupMinutes" >= 0 AND "turnaroundMinutes" >= 0);

-- ===========================================================================
-- US-48 AC-7: approving a change request rebooks the event's equipment
-- reservations and releases the originals; a released original links to the
-- reservation that replaced it. AC-9: the Organiser is notified of the
-- decision.
-- ===========================================================================
-- AlterTable
ALTER TABLE "EquipmentReservation" ADD COLUMN     "replacedById" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentReservation_replacedById_key" ON "EquipmentReservation"("replacedById");

-- AddForeignKey
ALTER TABLE "EquipmentReservation" ADD CONSTRAINT "EquipmentReservation_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "EquipmentReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CHANGE_REQUEST_DECIDED';

-- ===========================================================================
-- Readable IDs (CLAUDE.md, "IDs"): BookingSuggestion uses BSG-001…, and
-- EquipmentStatusChange uses ESC-001…, issued by nextReadableId
-- (src/prisma/readable-id.ts) from one counter per prefix.
-- ===========================================================================

-- CreateTable
CREATE TABLE "IdCounter" (
    "prefix" TEXT NOT NULL,
    "last" INTEGER NOT NULL,

    CONSTRAINT "IdCounter_pkey" PRIMARY KEY ("prefix")
);

-- Prisma cannot express CHECK constraints. Each table's IDs keep its format.
ALTER TABLE "BookingSuggestion"
  ADD CONSTRAINT "BookingSuggestion_readable_id"
  CHECK ("id" ~ '^BSG-[0-9]{3,}$');

ALTER TABLE "EquipmentStatusChange"
  ADD CONSTRAINT "EquipmentStatusChange_readable_id"
  CHECK ("id" ~ '^ESC-[0-9]{3,}$');

ALTER TABLE "IdCounter"
  ADD CONSTRAINT "IdCounter_last_positive"
  CHECK ("last" > 0);
