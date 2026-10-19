/**
 * Dev-only: set a venue's setup and turnaround minutes (US-50), so the
 * buffer-aware checks can be tried before #54 (the Venue Staff configuration
 * screen) exists. Writes only those two columns on one venue.
 *
 * LOCAL DATABASES ONLY — refuses to run unless DATABASE_URL and DIRECT_URL are
 * both set and both point at localhost, checked before anything connects, so
 * it can never touch the shared Supabase database.
 *
 * Usage:
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/set-venue-buffers.ts \
 *     "Sandbox Auditorium" 30 45
 */
import 'dotenv/config';

import { PrismaClient } from '@prisma/client';

const USAGE =
  'Usage: scripts/set-venue-buffers.ts "<venue name>" <setup minutes> <turnaround minutes>';

/** Both URLs must be set and local: Prisma uses either, depending on the call. */
function assertLocalDatabase(): void {
  for (const name of ['DATABASE_URL', 'DIRECT_URL']) {
    const value = process.env[name];
    if (!value) {
      throw new Error(`${name} is not set. Set it to your local Postgres.`);
    }
    let host: string;
    try {
      host = new URL(value).hostname;
    } catch {
      throw new Error(`${name} is not a valid URL.`);
    }
    if (host !== 'localhost' && host !== '127.0.0.1') {
      throw new Error(
        `${name} points at "${host}", not localhost. This script only runs against a local database.`,
      );
    }
  }
}

function minutes(value: string | undefined, label: string): number {
  const n = Number(value);
  if (value === undefined || !Number.isInteger(n) || n < 0) {
    throw new Error(`${label} must be a whole number of minutes, 0 or more.\n${USAGE}`);
  }
  return n;
}

async function main(): Promise<void> {
  const [venueName, setupArg, turnaroundArg] = process.argv.slice(2);
  if (!venueName) throw new Error(USAGE);
  const setupMinutes = minutes(setupArg, 'setup');
  const turnaroundMinutes = minutes(turnaroundArg, 'turnaround');

  // Checked before Prisma is created, so no connection is ever opened to a
  // non-local database.
  assertLocalDatabase();

  const prisma = new PrismaClient();
  try {
    const venues = await prisma.venue.findMany({ where: { name: venueName } });
    if (venues.length !== 1) {
      throw new Error(`Expected exactly one venue named "${venueName}", found ${venues.length}.`);
    }
    const updated = await prisma.venue.update({
      where: { id: venues[0].id },
      data: { setupMinutes, turnaroundMinutes },
      select: { name: true, setupMinutes: true, turnaroundMinutes: true },
    });
    console.log(
      `"${updated.name}": setup ${updated.setupMinutes} min, turnaround ${updated.turnaroundMinutes} min.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
