-- US-20 AC-3: the facilities an event needs, from the same Facility list venues
-- record (US-18), so suitability can compare the two exactly.
-- Adds a column only: every existing request gets an empty list ("none
-- recorded"), and no existing value is read, converted or dropped.
ALTER TABLE "EventRequest" ADD COLUMN "requiredFacilities" "Facility"[] NOT NULL DEFAULT ARRAY[]::"Facility"[];
