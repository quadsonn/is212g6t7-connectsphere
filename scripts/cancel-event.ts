/**
 * Dev-only: cancel an event through EventsService.setStatus(), so the US-33
 * equipment release runs exactly as it will when #43 adds a cancel endpoint.
 *
 * LOCAL DATABASES ONLY — refuses to run unless DATABASE_URL points at
 * localhost, so it can never touch the shared Supabase database.
 *
 * Usage (DATABASE_URL must be set to a local database in the same command):
 *   DATABASE_URL=postgresql://<you>@localhost:5432/connectsphere_local?schema=public \
 *   DIRECT_URL=postgresql://<you>@localhost:5432/connectsphere_local?schema=public \
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/cancel-event.ts "Capstone Showcase"
 */
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { EventStatus, ReservationStatus } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { EventsService } from '../src/events/events.service';
import { PrismaService } from '../src/prisma/prisma.service';

function assertLocalDatabase(): void {
  for (const name of ['DATABASE_URL', 'DIRECT_URL']) {
    const value = process.env[name];
    if (!value) continue;
    const host = new URL(value).hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') {
      throw new Error(
        `${name} points at "${host}", not localhost. This script only runs ` +
          'against a local database — set DATABASE_URL and DIRECT_URL to your ' +
          'local Postgres in the same command.',
      );
    }
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set.');
  }
}

async function main(): Promise<void> {
  const eventName = process.argv[2];
  if (!eventName) {
    throw new Error('Usage: scripts/cancel-event.ts "<event name>"');
  }

  // Checked before Nest (and Prisma) start, so no connection is ever opened
  // to a non-local database.
  assertLocalDatabase();

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const events = app.get(EventsService);

    const matches = await prisma.eventRequest.findMany({ where: { name: eventName } });
    if (matches.length !== 1) {
      throw new Error(
        `Expected exactly one event named "${eventName}", found ${matches.length}.`,
      );
    }
    const [event] = matches;

    if (event.status === EventStatus.CANCELLED) {
      console.log(`"${eventName}" is already CANCELLED — nothing to do.`);
      return;
    }

    const heldBefore = await prisma.equipmentReservation.count({
      where: { eventId: event.id, status: ReservationStatus.APPROVED },
    });

    // The sanctioned path: validates the transition, writes CANCELLED and
    // releases the event's reservations in one transaction (US-33 AC-1).
    await events.setStatus(event, EventStatus.CANCELLED);

    const released = await prisma.equipmentReservation.findMany({
      where: { eventId: event.id, status: ReservationStatus.RELEASED },
      include: { equipment: { select: { type: true } } },
    });

    console.log(`Cancelled "${eventName}" (was ${event.status}).`);
    console.log(`Committed reservations before: ${heldBefore}. Released now: ${released.length}.`);
    for (const r of released) {
      console.log(`  - ${r.quantity} × ${r.equipment.type}, released ${r.releasedAt?.toISOString()}`);
    }
    console.log('Open /equipment/released in the browser to see them.');
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
