/**
 * US-18 — lists every venue whose free-text facilities or accessibility values
 * could not be mapped onto the new enums by migration
 * 20261003120000_us18_venue_vocabulary.
 *
 * Read-only. Run after deploying the migration:
 *
 *   npm run venues:vocabulary-review
 *
 * Each line is a venue id, the field, and the unmapped strings, for a human to
 * correct in the venue form (pick the right checkbox, or leave it as a note).
 */
import { PrismaClient } from '@prisma/client';

export const UNMAPPED_MARKER = 'Unmapped during US-18 migration: ';

const prisma = new PrismaClient();

async function main() {
  const venues = await prisma.venue.findMany({
    where: {
      OR: [
        { facilityNotes: { startsWith: UNMAPPED_MARKER } },
        { accessibilityNotes: { startsWith: UNMAPPED_MARKER } },
      ],
    },
    select: { id: true, name: true, facilityNotes: true, accessibilityNotes: true },
    orderBy: { name: 'asc' },
  });

  if (venues.length === 0) {
    console.log('US-18: every venue facility and accessibility value was mapped. Nothing to review.');
    return;
  }

  console.log(`US-18: ${venues.length} venue(s) have values that need review:\n`);
  for (const venue of venues) {
    for (const [field, notes] of [
      ['facilities', venue.facilityNotes],
      ['accessibilityFeatures', venue.accessibilityNotes],
    ] as const) {
      if (notes?.startsWith(UNMAPPED_MARKER)) {
        console.log(`${venue.id}  ${venue.name ?? '(untitled)'}  ${field}: ${notes.slice(UNMAPPED_MARKER.length)}`);
      }
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
