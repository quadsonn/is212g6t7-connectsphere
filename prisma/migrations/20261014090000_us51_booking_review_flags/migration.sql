-- US-51 — "Conflict - needs review" flags on venue bookings.
--
-- Additive only. Every existing booking gets needsReview = false and nulls in
-- the new columns: nothing was flagged before this story. No existing value
-- is converted or discarded.
--
-- The flag is deliberately not a BookingStatus value. A status would take an
-- APPROVED booking out of the US-24 exclusion constraint (WHERE status =
-- 'APPROVED') and out of any "all bookings approved" check.

ALTER TYPE "BookingDecisionKind" ADD VALUE IF NOT EXISTS 'REVIEW_RESOLVED';

ALTER TABLE "VenueBooking"
  ADD COLUMN "needsReview"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "needsReviewReason"  TEXT,
  ADD COLUMN "flaggedAt"          TIMESTAMP(3),
  ADD COLUMN "reviewResolvedAt"   TIMESTAMP(3),
  ADD COLUMN "reviewResolvedById" TEXT;

ALTER TABLE "VenueBooking"
  ADD CONSTRAINT "VenueBooking_reviewResolvedById_fkey"
  FOREIGN KEY ("reviewResolvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "VenueBooking_venueId_needsReview_idx" ON "VenueBooking"("venueId", "needsReview");
