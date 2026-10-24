/**
 * US-66 — test data for "Assigned Tech Support receive equipment notifications".
 *
 * Every notification is produced by the app's own code, not inserted here:
 * the seed only sets the scene. Events (organiser@ / coordinator@), all
 * needing on-site support; tech@ is Wei, tech2@ is Nadia:
 *
 *   Gala Dinner        PLANNING, Wei assigned, 2 × Projector reserved
 *                      → organiser@ cancels it (AC-1)
 *   Supplier Summit    PLANNING, Wei assigned, 1 × Projector reserved
 *                      → coordinator@ rejects it as unfulfillable (AC-1)
 *   Annual Conference  CONFIRMED, Wei assigned, 3 × Projector reserved,
 *                      pending change request: one day later
 *                      → coordinator@ approves the change (AC-2)
 *   Hackathon          PLANNING, nobody assigned
 *                      → coordinator@ saves technical requirements: Wei and
 *                        Nadia both told; assign Wei (US-61), save again:
 *                        only Wei (AC-3)
 *
 * Usage:
 *   npm run prisma:seed:us66    set up (re-runnable: deletes the previous run first)
 *
 * Refuses to run against a non-local database.
 */
import 'dotenv/config';

import { ChangeRequestStatus, EventStatus, PrismaClient, ReservationStatus, RoomLayout } from '@prisma/client';

const PREFIX = '[US-66]';

const host = new URL(process.env.DATABASE_URL ?? '').hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`Refusing to seed US-66 test data: DATABASE_URL points at "${host}", not a local database.`);
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

interface SeedEvent {
  name: string;
  status: EventStatus;
  start: Date;
  end: Date;
  /** Wei (tech@) is assigned when true. */
  assigned: boolean;
  /** Projectors reserved (APPROVED) for the event's own window. */
  projectors: number;
  support: string | null;
  /** A pending change request moving the event by this many days. */
  moveDays?: number;
}

const EVENTS: SeedEvent[] = [
  {
    name: 'Gala Dinner',
    status: EventStatus.PLANNING,
    start: at(20, '18:00'),
    end: at(20, '22:00'),
    assigned: true,
    projectors: 2,
    support: 'Technician for the awards slideshow.',
  },
  {
    name: 'Supplier Summit',
    status: EventStatus.PLANNING,
    start: at(22, '09:00'),
    end: at(22, '12:00'),
    assigned: true,
    projectors: 1,
    support: 'Hybrid setup for overseas suppliers.',
  },
  {
    name: 'Annual Conference',
    status: EventStatus.CONFIRMED,
    start: at(25, '09:00'),
    end: at(25, '17:00'),
    assigned: true,
    projectors: 3,
    support: 'On-site AV technician all day.',
    moveDays: 1,
  },
  {
    name: 'Hackathon',
    status: EventStatus.PLANNING,
    start: at(28, '10:00'),
    end: at(28, '18:00'),
    assigned: false,
    projectors: 0,
    support: null,
  },
];

async function setUp() {
  const [organiser, coordinator, tech] = await Promise.all(
    ['organiser@connectsphere.local', 'coordinator@connectsphere.local', 'tech@connectsphere.local'].map(
      (email) => prisma.user.findUniqueOrThrow({ where: { email } }),
    ),
  );

  // Events first: they cascade to their reservations, change requests and
  // notifications, and the reservations reference the item.
  const events = await prisma.eventRequest.deleteMany({ where: { name: { startsWith: PREFIX } } });
  const items = await prisma.equipment.deleteMany({ where: { type: { startsWith: PREFIX } } });
  console.log(`removed previous run: ${events.count} events, ${items.count} equipment items`);

  const projector = await prisma.equipment.create({
    data: {
      type: `${PREFIX} Projector`,
      description: 'Seeded by prisma/seed-us66.ts.',
      location: 'AV store',
      totalQuantity: 10,
    },
  });

  for (const e of EVENTS) {
    const event = await prisma.eventRequest.create({
      data: {
        organiserId: organiser.id,
        coordinatorId: coordinator.id,
        name: `${PREFIX} ${e.name}`,
        purpose: 'US-66 technical support notification testing',
        description: 'Seeded by prisma/seed-us66.ts.',
        category: 'Testing',
        proposedStart: e.start,
        proposedEnd: e.end,
        expectedAttendance: 100,
        preferredLayout: RoomLayout.THEATRE,
        technicalSupportNeeds: e.support,
        technicalSupportId: e.assigned ? tech.id : null,
        status: e.status,
      },
    });

    if (e.projectors > 0) {
      await prisma.equipmentRequirement.create({
        data: { eventId: event.id, equipmentId: projector.id, equipmentType: projector.type, quantity: e.projectors },
      });
      await prisma.equipmentReservation.create({
        data: {
          eventId: event.id,
          equipmentId: projector.id,
          quantity: e.projectors,
          start: e.start,
          end: e.end,
          status: ReservationStatus.APPROVED,
        },
      });
    }

    if (e.moveDays) {
      await prisma.eventChangeRequest.create({
        data: {
          eventId: event.id,
          requestedById: organiser.id,
          status: ChangeRequestStatus.PENDING,
          reason: 'The keynote speaker can only make the following day.',
          proposedStart: new Date(e.start.getTime() + e.moveDays * DAY),
          proposedEnd: new Date(e.end.getTime() + e.moveDays * DAY),
        },
      });
    }

    console.log(`created: ${event.name} (${e.status}, ${e.assigned ? 'Wei assigned' : 'unassigned'})`);
  }
}

setUp()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
