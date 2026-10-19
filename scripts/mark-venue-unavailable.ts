/**
 * Dev-only: mark a venue unavailable for a period and run the US-52 reaction
 * — VenueUnavailabilityService.handleVenueUnavailable, the hook #57 ("mark
 * venue unavailable") will call once it is built.
 *
 * Like #57 will, it first records the unavailability as a blocked-out period
 * (a US-16 VenueBlock, attributed to the venue's manager), so the venue really
 * is unavailable afterwards: new requests and approvals in that period are
 * refused. Then the hook flags each overlapping live booking and notifies its
 * event's Coordinator. Nothing else changes — no event is cancelled.
 *
 * LOCAL DATABASES ONLY — refuses to run unless DATABASE_URL and DIRECT_URL are
 * both set and both point at localhost, checked before anything connects, so
 * it can never touch the shared Supabase database.
 *
 * Usage (times are ISO 8601; add Z for UTC, or omit it for your local time):
 *   DATABASE_URL=postgresql://<you>@localhost:5432/connectsphere_dev?schema=public \
 *   DIRECT_URL=postgresql://<you>@localhost:5432/connectsphere_dev?schema=public \
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/mark-venue-unavailable.ts \
 *     "Sandbox Auditorium" 2026-11-20T00:00:00Z 2026-11-21T00:00:00Z "Flood damage"
 */
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { NotificationType } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { VenueUnavailabilityService } from '../src/bookings/venue-unavailability.service';
import { PrismaService } from '../src/prisma/prisma.service';

const USAGE =
  'Usage: scripts/mark-venue-unavailable.ts "<venue name>" <start ISO> <end ISO> "<reason>"';

/** Both URLs must be set and local: Prisma uses either, depending on the call. */
function assertLocalDatabase(): void {
  for (const name of ['DATABASE_URL', 'DIRECT_URL']) {
    const value = process.env[name];
    if (!value) {
      throw new Error(`${name} is not set. Set it to your local Postgres in the same command.`);
    }

    let host: string;
    try {
      host = new URL(value).hostname;
    } catch {
      throw new Error(`${name} is not a valid URL.`);
    }

    if (host !== 'localhost' && host !== '127.0.0.1') {
      throw new Error(
        `${name} points at "${host}", not localhost. This script only runs ` +
          'against a local database — set DATABASE_URL and DIRECT_URL to your ' +
          'local Postgres in the same command.',
      );
    }
  }
}

function parseArgs(): { venueName: string; start: Date; end: Date; reason: string } {
  const [venueName, startArg, endArg, reasonArg] = process.argv.slice(2);
  if (!venueName || !startArg || !endArg || !reasonArg?.trim()) {
    throw new Error(USAGE);
  }

  const start = new Date(startArg);
  const end = new Date(endArg);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error(`start and end must be ISO 8601 dates.\n${USAGE}`);
  }
  if (end.getTime() <= start.getTime()) {
    throw new Error('end must be later than start.');
  }

  return { venueName, start, end, reason: reasonArg.trim() };
}

async function main(): Promise<void> {
  const { venueName, start, end, reason } = parseArgs();

  // Checked before Nest (and Prisma) start, so no connection is ever opened
  // to a non-local database.
  assertLocalDatabase();

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const unavailability = app.get(VenueUnavailabilityService);

    const venues = await prisma.venue.findMany({ where: { name: venueName } });
    if (venues.length !== 1) {
      throw new Error(`Expected exactly one venue named "${venueName}", found ${venues.length}.`);
    }
    const [venue] = venues;
    if (!venue.managedById) {
      throw new Error(
        `"${venueName}" has no managing Venue Staff member to record the unavailability against.`,
      );
    }

    // What #57 will record: the period and why.
    await prisma.venueBlock.create({
      data: { venueId: venue.id, start, end, reason, createdById: venue.managedById },
    });

    const ranAt = new Date();
    const affected = await unavailability.handleVenueUnavailable(venue.id, { start, end }, reason);

    console.log(
      `"${venueName}" marked unavailable ${start.toISOString()} – ${end.toISOString()}: ${reason}`,
    );
    console.log(`Bookings now needing a replacement: ${affected.length}.`);
    for (const b of affected) {
      console.log(
        `  - "${b.eventName ?? 'Untitled event'}", ${b.start.toISOString()} – ${b.end.toISOString()}` +
          (b.coordinatorId ? '' : ' (no Coordinator assigned — not notified)'),
      );
    }

    // There is no notifications page yet (E9), so show what was recorded.
    const notices = await prisma.notification.findMany({
      where: { type: NotificationType.VENUE_UNAVAILABLE, createdAt: { gte: ranAt } },
      include: { recipient: { select: { email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    console.log(`Notifications recorded: ${notices.length}.`);
    for (const n of notices) {
      console.log(`  → ${n.recipient.email}: ${n.message}`);
    }
    if (affected.length === 0) {
      console.log(
        'No live booking overlapped that period (already-flagged bookings are not flagged again).',
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
