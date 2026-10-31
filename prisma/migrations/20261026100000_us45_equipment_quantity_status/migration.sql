-- US-45 (reopened): equipment status by quantity.
--
-- Before: one operationalStatus per item, so marking it damaged or under
-- maintenance took every unit out of use. After: two counts, damagedQuantity
-- and maintenanceQuantity; available for a period is
--   totalQuantity - damaged - under maintenance - reserved.
--
-- operationalStatus is kept, derived from the counts by a trigger, because
-- US-29, US-31, US-48 and US-67 (and seeds and scripts) read it.
--
-- Nothing is discarded. Every item starts with 0 damaged and 0 under
-- maintenance, except an item currently marked as a whole: all of its units
-- go into that count (OUT_OF_SERVICE -> damagedQuantity = totalQuantity,
-- UNDER_MAINTENANCE -> maintenanceQuantity = totalQuantity), which is what the
-- old status meant. Each converted item is announced with a NOTICE.

-- 1. Notification types --------------------------------------------------------
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EQUIPMENT_RESERVATION_ADJUSTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EQUIPMENT_ALTERNATIVE_SUGGESTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EQUIPMENT_ALTERNATIVE_DECIDED';

-- 2. Equipment counts ----------------------------------------------------------
ALTER TABLE "Equipment"
  ADD COLUMN "damagedQuantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "maintenanceQuantity" INTEGER NOT NULL DEFAULT 0;

DO $do$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT "id", "type", "totalQuantity", "operationalStatus"
    FROM "Equipment"
    WHERE "operationalStatus" <> 'OPERATIONAL'
    ORDER BY "id"
  LOOP
    RAISE NOTICE 'US-45: % "%" was % as a whole; all % units moved to %',
      r."id", r."type", r."operationalStatus", r."totalQuantity",
      CASE WHEN r."operationalStatus" = 'OUT_OF_SERVICE' THEN 'damagedQuantity' ELSE 'maintenanceQuantity' END;
  END LOOP;
END
$do$;

UPDATE "Equipment" SET "damagedQuantity" = "totalQuantity"
  WHERE "operationalStatus" = 'OUT_OF_SERVICE';
UPDATE "Equipment" SET "maintenanceQuantity" = "totalQuantity"
  WHERE "operationalStatus" = 'UNDER_MAINTENANCE';

ALTER TABLE "Equipment"
  ADD CONSTRAINT "Equipment_damaged_not_negative" CHECK ("damagedQuantity" >= 0),
  ADD CONSTRAINT "Equipment_maintenance_not_negative" CHECK ("maintenanceQuantity" >= 0),
  ADD CONSTRAINT "Equipment_out_of_use_within_total"
    CHECK ("damagedQuantity" + "maintenanceQuantity" <= "totalQuantity");

-- 3. operationalStatus, derived ------------------------------------------------
-- Counts drive the status. A write that changes only the status (an older
-- seed, script or fixture) is read the old way, as the whole item, and the
-- counts are set to match — the same rule as the conversion above.
CREATE OR REPLACE FUNCTION equipment_sync_operational_status() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  counts_changed BOOLEAN;
  status_changed BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    counts_changed := NEW."damagedQuantity" <> 0 OR NEW."maintenanceQuantity" <> 0;
    status_changed := NEW."operationalStatus" <> 'OPERATIONAL';
  ELSE
    counts_changed := NEW."damagedQuantity" IS DISTINCT FROM OLD."damagedQuantity"
      OR NEW."maintenanceQuantity" IS DISTINCT FROM OLD."maintenanceQuantity";
    status_changed := NEW."operationalStatus" IS DISTINCT FROM OLD."operationalStatus";
  END IF;

  IF status_changed AND NOT counts_changed THEN
    NEW."damagedQuantity" := CASE WHEN NEW."operationalStatus" = 'OUT_OF_SERVICE' THEN NEW."totalQuantity" ELSE 0 END;
    NEW."maintenanceQuantity" := CASE WHEN NEW."operationalStatus" = 'UNDER_MAINTENANCE' THEN NEW."totalQuantity" ELSE 0 END;
  END IF;

  NEW."operationalStatus" := CASE
    WHEN NEW."damagedQuantity" + NEW."maintenanceQuantity" < NEW."totalQuantity"
      OR (NEW."damagedQuantity" = 0 AND NEW."maintenanceQuantity" = 0) THEN 'OPERATIONAL'
    WHEN NEW."damagedQuantity" > 0 THEN 'OUT_OF_SERVICE'
    ELSE 'UNDER_MAINTENANCE'
  END::"EquipmentStatus";

  RETURN NEW;
END
$$;

CREATE TRIGGER "Equipment_sync_operational_status"
  BEFORE INSERT OR UPDATE ON "Equipment"
  FOR EACH ROW EXECUTE FUNCTION equipment_sync_operational_status();

-- 4. Status history by quantity ------------------------------------------------
-- Rows recorded before counts existed moved the whole item: they carry its
-- total quantity.
ALTER TABLE "EquipmentStatusChange" ADD COLUMN "quantity" INTEGER;
UPDATE "EquipmentStatusChange" s SET "quantity" = e."totalQuantity"
  FROM "Equipment" e WHERE e."id" = s."equipmentId";
ALTER TABLE "EquipmentStatusChange" ALTER COLUMN "quantity" SET NOT NULL;
ALTER TABLE "EquipmentStatusChange"
  ADD CONSTRAINT "EquipmentStatusChange_quantity_positive" CHECK ("quantity" > 0);

-- 5. Suggested alternatives ----------------------------------------------------
CREATE TYPE "EquipmentSuggestionStatus" AS ENUM ('OPEN', 'ACCEPTED', 'DECLINED', 'INVALID');

CREATE TABLE "EquipmentSuggestion" (
  "id" TEXT NOT NULL DEFAULT next_readable_id('ESG'::text),
  "reservationId" TEXT NOT NULL,
  "alternativeEquipmentId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "EquipmentSuggestionStatus" NOT NULL DEFAULT 'OPEN',
  "suggestedById" TEXT NOT NULL,
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EquipmentSuggestion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EquipmentSuggestion_readable_id" CHECK ("id" ~ '^ESG-[0-9]{3,}$'),
  CONSTRAINT "EquipmentSuggestion_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "EquipmentSuggestion_has_reason" CHECK (length(btrim("reason")) > 0)
);

CREATE INDEX "EquipmentSuggestion_reservationId_status_idx" ON "EquipmentSuggestion"("reservationId", "status");
CREATE INDEX "EquipmentSuggestion_alternativeEquipmentId_idx" ON "EquipmentSuggestion"("alternativeEquipmentId");

-- Only one open suggestion per short reservation at a time.
CREATE UNIQUE INDEX "EquipmentSuggestion_one_open_per_reservation"
  ON "EquipmentSuggestion"("reservationId") WHERE "status" = 'OPEN';

ALTER TABLE "EquipmentSuggestion" ADD CONSTRAINT "EquipmentSuggestion_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "EquipmentReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EquipmentSuggestion" ADD CONSTRAINT "EquipmentSuggestion_alternativeEquipmentId_fkey"
  FOREIGN KEY ("alternativeEquipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EquipmentSuggestion" ADD CONSTRAINT "EquipmentSuggestion_suggestedById_fkey"
  FOREIGN KEY ("suggestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EquipmentSuggestion" ADD CONSTRAINT "EquipmentSuggestion_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
