/**
 * Gives every venue without photos two demo photos (see venue-photos.ts), so
 * the Coordinator's venue catalogue shows real cards. Venues that already have
 * photos, e.g. ones Venue Staff uploaded, are left alone.
 *
 * Re-runnable: a second run finds nothing to fill. Refuses to run against a
 * non-local database.
 *
 * Usage: npm run prisma:seed:venue-photos
 */
import 'dotenv/config';

import { PrismaClient } from '@prisma/client';

import { photosForVenue } from './venue-photos';

const host = new URL(process.env.DATABASE_URL ?? '').hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`Refusing to seed venue photos: DATABASE_URL points at "${host}", not a local database.`);
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const venues = await prisma.venue.findMany({
    where: { imageUrls: { isEmpty: true } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });

  for (const [index, venue] of venues.entries()) {
    await prisma.venue.update({
      where: { id: venue.id },
      data: { imageUrls: photosForVenue(venue.name ?? '', index) },
    });
  }

  console.log(`Added photos to ${venues.length} venue${venues.length === 1 ? '' : 's'}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
