# ADR 0011 — Accessibility vocabulary for venue suitability matching

- Status: Proposed
- Date: 2026-11-01
- Story: #6 Layout and accessibility, #13 Add venue, #18 Search/filter, #19 Suitability flag, #33 Register

> **⚠ Contradiction with the issue as stated** ("inconsistent accessibility vocabulary blocking
> venue suitability matching"): the structured vocabulary is already shared.
> - One `AccessibilityFeature` enum (7 values) is used by `EventRequest.accessibilityRequirements`,
>   `Venue.accessibilityFeatures`, `VenueBooking.accessibilityRequirements` and
>   `Registration.accessibilityFeature`.
> - #18 (`20261003120000_us18_venue_vocabulary`) moved venue free text onto that enum. The schema
>   says: "so a venue's offer and an event's need are directly comparable".
> - #19 `checkAccessibility()` matches exactly, one flag per requirement, and is unit-tested.

## Context: what is actually still open

- **Free-text notes are not matched.** Event, venue and booking each have an `accessibilityNotes`
  field for needs outside the enum. Suitability ignores them, so a need that exists only in notes
  is never flagged.
- **Legacy unmapped values.** The #18 migration moved unmatched venue strings into notes with the
  marker `Unmapped during US-18 migration: `. They stay unmatched until a person fixes them
  (`npm run venues:vocabulary-review`). TODO(team): confirm whether that review has been run on
  Supabase.
- **Attendee need is single-valued.** `Registration.accessibilityFeature` holds one value plus free
  text, while events and venues hold arrays.
- **Safety review** records accessibility as a free-text comment (`SafetyReview.accessibilityComment`).
- The enum is the "agreed fuller set" of 7. Step-free access deliberately lives only here, not in
  `Facility`.

## Options (not decided)

1. **Status quo.** The enum is the contract. Notes are for people to read and are shown alongside
   the suitability result.
2. **Grow the enum** as the customer names new needs (additive `ADD VALUE` is cheap), and
   periodically move common note phrases into it.
3. **Surface notes in suitability** as a "needs manual check" item, as #42 does for free-text
   equipment.
4. **Make Registration multi-valued** (`AccessibilityFeature[]`) to match events and venues. This
   needs a migration that keeps existing values (CLAUDE.md §9).

## Consequences

To be filled in when an option is chosen. TODO(team).

## Related

- `prisma/schema.prisma` (`AccessibilityFeature`, `Venue`, `EventRequest`, `Registration`)
- `prisma/migrations/20260908053400_us06_layout_and_accessibility`,
  `20260919090000_extend_accessibility_features`, `20261003120000_us18_venue_vocabulary`,
  `20261012171057_registration_accessibility_feature`
- `src/venues/suitability.ts`, `prisma/review-venue-vocabulary.ts`
- Tests: `src/venues/suitability.spec.ts`, `test/venue-vocabulary-migration.e2e-spec.ts`
