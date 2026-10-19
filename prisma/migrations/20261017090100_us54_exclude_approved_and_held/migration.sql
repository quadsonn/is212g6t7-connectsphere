-- US-54: a live tentative hold blocks its slot as firmly as an approved
-- booking, enforced by the database. See
-- docs/adr/0001-held-hard-blocks-at-db-level.md.
--
-- Hand-written: Prisma's schema language cannot express EXCLUDE constraints.
-- Replaces US-24's "VenueBooking_no_overlapping_approved" (WHERE status =
-- 'APPROVED') with the same constraint over APPROVED and HELD. The range
-- expression is unchanged — tsrange("start", "end"), half-open '[)' — because
-- buffer padding (US-50) is not built yet; when it is, it must keep the
-- expression it finds here and change only the range.
--
-- REQUESTED stays out on purpose: pending requests may overlap (a team
-- decision, US-24 AC-3), they only warn.
--
-- An expired HELD row is still HELD until something releases it, so it is
-- still covered here. The app therefore releases a venue's expired holds,
-- under the venue lock, before it inserts or approves anything on that venue
-- (releaseExpiredHolds in src/bookings/hold-expiry.ts); the expiry job does the
-- same every minute for all venues.

-- Preflight: stop with a list, rather than a bare constraint error, if the
-- data already breaks the new rule. Nothing below runs, and no row is changed,
-- unless this passes. On a fresh US-54 database no row is HELD yet, so this can
-- only find APPROVED pairs the US-24 constraint already rules out — it is here
-- for databases that got HELD rows some other way.
DO $$
DECLARE
  bad_ranges TEXT;
  -- Not "overlaps": OVERLAPS is a reserved word in Postgres.
  overlap_pairs TEXT;
  holds_without_expiry TEXT;
BEGIN
  SELECT string_agg(format('  %s (%s, start %s, end %s)', "id", "status", "start", "end"), E'\n' ORDER BY "id")
    INTO bad_ranges
    FROM "VenueBooking"
   WHERE "status" IN ('APPROVED', 'HELD') AND "end" < "start";

  SELECT string_agg(
           format('  %s (%s) and %s (%s) on venue %s', a."id", a."status", b."id", b."status", a."venueId"),
           E'\n' ORDER BY a."venueId", a."id", b."id")
    INTO overlap_pairs
    FROM "VenueBooking" a
    JOIN "VenueBooking" b
      ON a."venueId" = b."venueId"
     AND a."id" < b."id"
     AND a."status" IN ('APPROVED', 'HELD')
     AND b."status" IN ('APPROVED', 'HELD')
     AND a."end" >= a."start"
     AND b."end" >= b."start"
     AND tsrange(a."start", a."end") && tsrange(b."start", b."end");

  SELECT string_agg(format('  %s', "id"), E'\n' ORDER BY "id")
    INTO holds_without_expiry
    FROM "VenueBooking"
   WHERE "status" = 'HELD' AND "holdExpiresAt" IS NULL;

  IF bad_ranges IS NOT NULL OR overlap_pairs IS NOT NULL OR holds_without_expiry IS NOT NULL THEN
    RAISE EXCEPTION 'US-54 migration stopped: existing bookings break the APPROVED/HELD rules. Nothing was changed.%',
      coalesce(E'\nOverlapping APPROVED/HELD bookings:\n' || overlap_pairs, '')
        || coalesce(E'\nAPPROVED/HELD bookings ending before they start:\n' || bad_ranges, '')
        || coalesce(E'\nHELD bookings with no expiry:\n' || holds_without_expiry, '')
      USING HINT = 'Release or reject one booking of each pair (or correct its times, or give the hold an expiry), then run the migration again.';
  END IF;
END $$;

ALTER TABLE "VenueBooking" DROP CONSTRAINT "VenueBooking_no_overlapping_approved";

ALTER TABLE "VenueBooking"
  ADD CONSTRAINT "VenueBooking_no_overlapping_committed"
  EXCLUDE USING gist ("venueId" WITH =, tsrange("start", "end") WITH &&)
  WHERE ("status" IN ('APPROVED', 'HELD'));

-- A hold always has an expiry; without one it would block the slot forever.
ALTER TABLE "VenueBooking"
  ADD CONSTRAINT "VenueBooking_hold_has_expiry"
  CHECK ("status" <> 'HELD' OR "holdExpiresAt" IS NOT NULL);
