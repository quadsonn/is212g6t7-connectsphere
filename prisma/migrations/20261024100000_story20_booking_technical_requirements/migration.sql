-- Story 20 AC-2: a booking request also carries the event's technical
-- requirements, so Venue Staff see them without opening the event: its
-- required facilities, its equipment lines (a JSON copy) and the technical
-- support it needs.
-- Adds columns only. Existing requests keep equipmentRequirements NULL, which
-- reads as "not recorded on this request": they are not backfilled from the
-- event, whose current data may not be what was submitted.
ALTER TABLE "VenueBooking" ADD COLUMN "requiredFacilities" "Facility"[] NOT NULL DEFAULT ARRAY[]::"Facility"[];
ALTER TABLE "VenueBooking" ADD COLUMN "equipmentRequirements" JSONB;
ALTER TABLE "VenueBooking" ADD COLUMN "technicalSupportNeeds" TEXT;
