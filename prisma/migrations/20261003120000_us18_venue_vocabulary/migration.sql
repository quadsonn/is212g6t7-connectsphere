-- US-18: venue facilities and accessibility move from free text to controlled
-- vocabularies, so search can AND-match them.
--
-- Hand-written. `prisma migrate dev` would generate DROP COLUMN + ADD COLUMN,
-- discarding every existing value. Instead each value is normalised and mapped:
--
--   * a value that matches an enum value or a known synonym is converted;
--   * a value that matches nothing is NOT dropped. It is appended to the new
--     facilityNotes / accessibilityNotes column after the marker
--     "Unmapped during US-18 migration: ", and announced with RAISE NOTICE.
--
-- After deploying, run `npm run venues:vocabulary-review` to list every venue
-- with an unmapped value for a human to correct. (Prisma does not print
-- NOTICEs, so the review script is the reliable report.)
--
-- The end state matches what Prisma generates from schema.prisma exactly —
-- same types, defaults and index names — so there is no drift afterwards.

-- CreateEnum
CREATE TYPE "Facility" AS ENUM ('PROJECTOR', 'SCREEN', 'SOUND_SYSTEM', 'MICROPHONE', 'STAGE', 'WIFI', 'VIDEO_CONFERENCING', 'WHITEBOARD', 'POWER_OUTLETS', 'CATERING_KITCHEN', 'AIR_CONDITIONING');

ALTER TABLE "Venue"
  ADD COLUMN "facilityNotes" TEXT,
  ADD COLUMN "accessibilityNotes" TEXT,
  ADD COLUMN "facilities_us18" "Facility"[] DEFAULT ARRAY[]::"Facility"[],
  ADD COLUMN "accessibilityFeatures_us18" "AccessibilityFeature"[] DEFAULT ARRAY[]::"AccessibilityFeature"[];

-- Synonyms, keyed on the normalised form: lower case, every run of
-- non-alphanumerics collapsed to one space, trimmed. Each enum value's own
-- name is a synonym too ("POWER_OUTLETS" -> "power outlets").
CREATE TEMP TABLE "us18_facility_alias" (alias TEXT PRIMARY KEY, value "Facility" NOT NULL);
INSERT INTO "us18_facility_alias" (alias, value)
SELECT trim(regexp_replace(lower(v::text), '[^a-z0-9]+', ' ', 'g')), v
FROM unnest(enum_range(NULL::"Facility")) AS v;
INSERT INTO "us18_facility_alias" (alias, value) VALUES
  ('projectors', 'PROJECTOR'),
  ('projection screen', 'SCREEN'),
  ('screens', 'SCREEN'),
  ('speakers', 'SOUND_SYSTEM'),
  ('speaker', 'SOUND_SYSTEM'),
  ('pa system', 'SOUND_SYSTEM'),
  ('pa', 'SOUND_SYSTEM'),
  ('audio system', 'SOUND_SYSTEM'),
  ('microphones', 'MICROPHONE'),
  ('mic', 'MICROPHONE'),
  ('mics', 'MICROPHONE'),
  ('wi fi', 'WIFI'),
  ('wireless internet', 'WIFI'),
  ('video conference', 'VIDEO_CONFERENCING'),
  ('videoconferencing', 'VIDEO_CONFERENCING'),
  ('whiteboards', 'WHITEBOARD'),
  ('power supply', 'POWER_OUTLETS'),
  ('power', 'POWER_OUTLETS'),
  ('power outlet', 'POWER_OUTLETS'),
  ('power points', 'POWER_OUTLETS'),
  ('power sockets', 'POWER_OUTLETS'),
  ('kitchen', 'CATERING_KITCHEN'),
  ('aircon', 'AIR_CONDITIONING'),
  ('air con', 'AIR_CONDITIONING'),
  ('air conditioned', 'AIR_CONDITIONING')
ON CONFLICT (alias) DO NOTHING;

CREATE TEMP TABLE "us18_accessibility_alias" (alias TEXT PRIMARY KEY, value "AccessibilityFeature" NOT NULL);
INSERT INTO "us18_accessibility_alias" (alias, value)
SELECT trim(regexp_replace(lower(v::text), '[^a-z0-9]+', ' ', 'g')), v
FROM unnest(enum_range(NULL::"AccessibilityFeature")) AS v;
INSERT INTO "us18_accessibility_alias" (alias, value) VALUES
  ('step free', 'STEP_FREE_ACCESS'),
  ('wheelchair ramp', 'STEP_FREE_ACCESS'),
  ('wheelchair ramp access', 'STEP_FREE_ACCESS'),
  ('ramp access', 'STEP_FREE_ACCESS'),
  ('lift', 'WHEELCHAIR_ACCESSIBLE_LIFT'),
  ('elevator', 'WHEELCHAIR_ACCESSIBLE_LIFT'),
  ('wheelchair lift', 'WHEELCHAIR_ACCESSIBLE_LIFT'),
  ('accessible toilets', 'ACCESSIBLE_RESTROOMS'),
  ('accessible toilet', 'ACCESSIBLE_RESTROOMS'),
  ('accessible restroom', 'ACCESSIBLE_RESTROOMS'),
  ('accessible washroom', 'ACCESSIBLE_RESTROOMS'),
  ('induction loop', 'HEARING_LOOP'),
  ('lactation room', 'NURSING_ROOM')
ON CONFLICT (alias) DO NOTHING;

-- Backfill the typed columns. DISTINCT so two synonyms of one value do not
-- produce a duplicate; ordered by enum position for stable output.
UPDATE "Venue" AS venue SET
  "facilities_us18" = ARRAY(
    SELECT DISTINCT a.value
    FROM unnest(venue."facilities") AS raw
    JOIN "us18_facility_alias" AS a
      ON a.alias = trim(regexp_replace(lower(raw), '[^a-z0-9]+', ' ', 'g'))
    ORDER BY a.value
  ),
  "accessibilityFeatures_us18" = ARRAY(
    SELECT DISTINCT a.value
    FROM unnest(venue."accessibilityFeatures") AS raw
    JOIN "us18_accessibility_alias" AS a
      ON a.alias = trim(regexp_replace(lower(raw), '[^a-z0-9]+', ' ', 'g'))
    ORDER BY a.value
  );

-- Preserve, and announce, everything that did not map.
DO $$
DECLARE
  item RECORD;
BEGIN
  FOR item IN
    SELECT venue."id", 'facilities' AS field, raw AS value
    FROM "Venue" AS venue, unnest(venue."facilities") AS raw
    WHERE trim(raw) <> '' AND NOT EXISTS (
      SELECT 1 FROM "us18_facility_alias" AS a
      WHERE a.alias = trim(regexp_replace(lower(raw), '[^a-z0-9]+', ' ', 'g')))
    UNION ALL
    SELECT venue."id", 'accessibilityFeatures', raw
    FROM "Venue" AS venue, unnest(venue."accessibilityFeatures") AS raw
    WHERE trim(raw) <> '' AND NOT EXISTS (
      SELECT 1 FROM "us18_accessibility_alias" AS a
      WHERE a.alias = trim(regexp_replace(lower(raw), '[^a-z0-9]+', ' ', 'g')))
  LOOP
    RAISE NOTICE 'US-18 unmapped venue %: % "%"', item."id", item.field, item.value;
  END LOOP;
END $$;

UPDATE "Venue" AS venue SET "facilityNotes" = 'Unmapped during US-18 migration: ' || unmapped.list
FROM (
  SELECT v."id", string_agg(raw, '; ' ORDER BY ord) AS list
  FROM "Venue" AS v, unnest(v."facilities") WITH ORDINALITY AS u(raw, ord)
  WHERE trim(raw) <> '' AND NOT EXISTS (
    SELECT 1 FROM "us18_facility_alias" AS a
    WHERE a.alias = trim(regexp_replace(lower(raw), '[^a-z0-9]+', ' ', 'g')))
  GROUP BY v."id"
) AS unmapped
WHERE venue."id" = unmapped."id";

UPDATE "Venue" AS venue SET "accessibilityNotes" = 'Unmapped during US-18 migration: ' || unmapped.list
FROM (
  SELECT v."id", string_agg(raw, '; ' ORDER BY ord) AS list
  FROM "Venue" AS v, unnest(v."accessibilityFeatures") WITH ORDINALITY AS u(raw, ord)
  WHERE trim(raw) <> '' AND NOT EXISTS (
    SELECT 1 FROM "us18_accessibility_alias" AS a
    WHERE a.alias = trim(regexp_replace(lower(raw), '[^a-z0-9]+', ' ', 'g')))
  GROUP BY v."id"
) AS unmapped
WHERE venue."id" = unmapped."id";

DROP TABLE "us18_facility_alias";
DROP TABLE "us18_accessibility_alias";

-- Swap the typed columns in under the original names.
ALTER TABLE "Venue" DROP COLUMN "facilities";
ALTER TABLE "Venue" DROP COLUMN "accessibilityFeatures";
ALTER TABLE "Venue" RENAME COLUMN "facilities_us18" TO "facilities";
ALTER TABLE "Venue" RENAME COLUMN "accessibilityFeatures_us18" TO "accessibilityFeatures";

-- CreateIndex
CREATE INDEX "Venue_status_capacity_idx" ON "Venue"("status", "capacity");

-- CreateIndex
CREATE INDEX "Venue_facilities_idx" ON "Venue" USING GIN ("facilities");

-- CreateIndex
CREATE INDEX "Venue_accessibilityFeatures_idx" ON "Venue" USING GIN ("accessibilityFeatures");
