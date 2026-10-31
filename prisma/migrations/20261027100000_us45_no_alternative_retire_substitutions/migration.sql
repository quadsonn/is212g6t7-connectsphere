-- US-45: "no valid alternative" joins the suggestion flow, and the separate
-- substitution flow (20261026090000_equipment_substitutions) is retired in its
-- favour. The team chose to keep US-45's quantity-based suggestions; the
-- substitution flow worked on whole items only.
--
-- What is dropped: the EquipmentSubstitution table and its status enum. Its
-- rows were proposals about whole items now handled by suggestions; how many
-- there were is announced with a NOTICE. Notifications already sent with the
-- substitution types are kept, and so are those two NotificationType values.

-- 1. Retire the substitution flow ---------------------------------------------
DO $do$
DECLARE
  n INTEGER;
BEGIN
  SELECT count(*) INTO n FROM "EquipmentSubstitution";
  IF n > 0 THEN
    RAISE NOTICE 'US-45: dropping % EquipmentSubstitution row(s) (retired flow; replaced by EquipmentSuggestion)', n;
  END IF;
END
$do$;

DROP TABLE "EquipmentSubstitution";
DROP TYPE "SubstitutionStatus";

-- 2. "No valid alternative" ----------------------------------------------------
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EQUIPMENT_NO_ALTERNATIVE';
ALTER TYPE "EquipmentSuggestionStatus" ADD VALUE IF NOT EXISTS 'NO_ALTERNATIVE';

-- Such a record names no item and no quantity; every other one names both.
-- Compared as text: a new enum value cannot be used in the statement that
-- adds it.
ALTER TABLE "EquipmentSuggestion"
  ALTER COLUMN "alternativeEquipmentId" DROP NOT NULL,
  ALTER COLUMN "quantity" DROP NOT NULL,
  ADD CONSTRAINT "EquipmentSuggestion_no_alternative_names_nothing" CHECK (
    ("status"::text = 'NO_ALTERNATIVE') = ("alternativeEquipmentId" IS NULL)
    AND ("alternativeEquipmentId" IS NULL) = ("quantity" IS NULL)
  );
