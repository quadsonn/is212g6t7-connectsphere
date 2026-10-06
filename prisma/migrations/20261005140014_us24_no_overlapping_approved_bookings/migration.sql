-- US-24 — no two APPROVED bookings may overlap on the same venue, enforced by
-- the database.
--
-- Hand-written: Prisma's schema language cannot express EXCLUDE constraints.
--
-- BookingsService already serialises approvals per venue (lockVenue) and
-- re-checks overlaps at approval time. This constraint is the backstop for
-- anything that writes VenueBooking without going through that path (scripts,
-- manual SQL, future code). A violation raises SQLSTATE 23P01, which
-- BookingsService maps to the same 409 as an app-level hard conflict.
--
-- tsrange, not tstzrange: "start"/"end" are TIMESTAMP(3) WITHOUT TIME ZONE,
-- and casting those to timestamptz depends on the session TimeZone, which
-- Postgres rejects in a constraint (not IMMUTABLE). tsrange's default bounds
-- are half-open '[)', the same rule as src/bookings/booking-overlap.ts, so a
-- booking ending exactly when another starts is still allowed.
--
-- Venue blocks (US-16) live in another table and cannot be part of this
-- constraint; the service check still covers them.
--
-- Turnaround/buffer time between bookings is intentionally NOT modelled: the
-- customer clarified it is not needed, superseding the AC that mentions it.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Preflight: the ALTER below fails if the data already breaks the rule. Find
-- every offending row first and stop with a list, rather than failing with a
-- bare constraint error or changing any data. The check runs before the
-- constraint is added, and no statement in this migration modifies rows.
DO $$
DECLARE
  bad_ranges TEXT;
  -- Not "overlaps": OVERLAPS is a reserved word in Postgres.
  overlap_pairs TEXT;
BEGIN
  -- tsrange() itself errors on end < start, so report those separately.
  SELECT string_agg(format('  %s (start %s, end %s)', "id", "start", "end"), E'\n' ORDER BY "id")
    INTO bad_ranges
    FROM "VenueBooking"
   WHERE "status" = 'APPROVED' AND "end" < "start";

  SELECT string_agg(
           format('  %s and %s on venue %s', a."id", b."id", a."venueId"),
           E'\n' ORDER BY a."venueId", a."id", b."id")
    INTO overlap_pairs
    FROM "VenueBooking" a
    JOIN "VenueBooking" b
      ON a."venueId" = b."venueId"
     AND a."id" < b."id"
     AND a."status" = 'APPROVED'
     AND b."status" = 'APPROVED'
     AND a."end" >= a."start"
     AND b."end" >= b."start"
     AND tsrange(a."start", a."end") && tsrange(b."start", b."end");

  IF bad_ranges IS NOT NULL OR overlap_pairs IS NOT NULL THEN
    RAISE EXCEPTION 'US-24 migration stopped: existing APPROVED bookings break the no-overlap rule. Nothing was changed.%',
      coalesce(E'\nOverlapping APPROVED bookings:\n' || overlap_pairs, '')
        || coalesce(E'\nAPPROVED bookings ending before they start:\n' || bad_ranges, '')
      USING HINT = 'Resolve these through the app (reverse/reject one booking of each pair, or correct its times), then run the migration again.';
  END IF;
END $$;

ALTER TABLE "VenueBooking"
  ADD CONSTRAINT "VenueBooking_no_overlapping_approved"
  EXCLUDE USING gist ("venueId" WITH =, tsrange("start", "end") WITH &&)
  WHERE ("status" = 'APPROVED');
