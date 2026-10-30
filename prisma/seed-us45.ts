/**
 * US-45 (reopened) — demo data for marking a quantity of equipment damaged or
 * under maintenance, and for resolving the shortage that can cause.
 *
 * Three items, all working when seeded:
 *   [US-45] Projector        10 units  ← the item the guide marks damaged
 *   [US-45] Laser projector   4 units  ← the alternative to suggest
 *   [US-45] Screen            1 unit   ← too few to be offered as an alternative
 *
 * Events, organised by organiser@ (Priya), coordinated by coordinator@
 * (Marcus), with tech@ (Wei) as Technical Support:
 *   [US-45] Gala Dinner     CONFIRMED  +20 days 18:00–22:00  5 × Projector
 *   [US-45] Product Launch  PLANNING   +20 days 19:00–21:00  5 × Projector (overlaps the Gala)
 *   [US-45] Past Workshop   COMPLETED  −10 days              10 × Projector (over; never counts)
 *
 * Mark 3 projectors damaged and the 7 left can't cover the 10 reserved at
 * 19:00–21:00: both upcoming reservations become "Short by 3".
 *
 * Re-runnable: deletes every event and item named [US-45] (reservations,
 * suggestions, history and notifications go with them), then recreates them.
 * Refuses to run against a non-local database.
 *
 * Usage: npm run prisma:seed:us45
 */
import 'dotenv/config';

import { EventStatus, PrismaClient, ReservationStatus } from '@prisma/client';

const PREFIX = '[US-45]';

const host = new URL(process.env.DATABASE_URL ?? '').hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`Refusing to seed US-45 test data: DATABASE_URL points at "${host}", not a local database.`);
  process.exit(1);
}

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;

/** Local time `hh:mm` on the day `days` from today. */
function at(days: number, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(Date.now() + days * DAY);
  d.setHours(h, m, 0, 0);
  return d;
}

async function main() {
  const find = (email: string) =>
    prisma.user.findUniqueOrThrow({ where: { email: `${email}@connectsphere.local` } });
  const [organiser, coordinator, tech] = await Promise.all(['organiser', 'coordinator', 'tech'].map(find));

  // Events first: they cascade to their reservations (and so suggestions),
  // history and notifications. Then the items, with their status history.
  const events = await prisma.eventRequest.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.notification.deleteMany({ where: { relatedEquipment: { type: { startsWith: PREFIX } } } });
  const items = await prisma.equipment.deleteMany({ where: { type: { startsWith: PREFIX } } });
  console.log(`removed previous run: ${events.count} events, ${items.count} items`);

  const item = (type: string, totalQuantity: number) =>
    prisma.equipment.create({
      data: { type: `${PREFIX} ${type}`, totalQuantity, location: 'US-45 AV store', description: 'Seeded by prisma/seed-us45.ts.' },
    });
  const projector = await item('Projector', 10);
  await item('Laser projector', 4);
  await item('Screen', 1);

  const event = (name: string, status: EventStatus, start: Date, end: Date) =>
    prisma.eventRequest.create({
      data: {
        organiserId: organiser.id,
        coordinatorId: coordinator.id,
        technicalSupportId: tech.id,
        name: `${PREFIX} ${name}`,
        purpose: 'US-45 equipment shortage demo',
        description: 'Seeded by prisma/seed-us45.ts.',
        category: 'Demo',
        proposedStart: start,
        proposedEnd: end,
        expectedAttendance: 80,
        status,
      },
    });

  const reserve = (eventId: string, quantity: number, start: Date, end: Date) =>
    prisma.equipmentReservation.create({
      data: { eventId, equipmentId: projector.id, quantity, start, end, status: ReservationStatus.APPROVED },
    });

  const galaWindow = [at(20, '18:00'), at(20, '22:00')] as const;
  const launchWindow = [at(20, '19:00'), at(20, '21:00')] as const;
  const pastWindow = [at(-10, '09:00'), at(-10, '17:00')] as const;

  const gala = await event('Gala Dinner', EventStatus.CONFIRMED, ...galaWindow);
  const launch = await event('Product Launch', EventStatus.PLANNING, ...launchWindow);
  const past = await event('Past Workshop', EventStatus.COMPLETED, ...pastWindow);

  await reserve(gala.id, 5, ...galaWindow);
  await reserve(launch.id, 5, ...launchWindow);
  await reserve(past.id, 10, ...pastWindow);

  console.log(
    [
      `seeded 3 items and 3 events (${gala.id} Gala Dinner, ${launch.id} Product Launch, ${past.id} Past Workshop)`,
      `item page: http://localhost:5173/equipment/inventory/${projector.id}`,
      'log in (password 12345678): tech@ (Wei), coordinator@ (Marcus), organiser@ (Priya), tech2@ (Nadia)',
    ].join('\n'),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
