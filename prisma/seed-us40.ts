/**
 * US-40 — test data for "Venue Activity Notifications".
 *
 * Every notification is produced by the app's own code, not inserted here:
 * the seed only sets the scene, and each trigger is something you do (or the
 * running API's hold-expiry job does). Venues:
 *
 *   [US-40] Harbour Hall   managed by venue@  (Aisha)
 *   [US-40] Garden Room    managed by venue@  (Aisha)
 *   [US-40] Liam's Studio  managed by venue2@ (Liam) — Aisha must never hear about it
 *
 * Events (organiser@ / coordinator@), and the trigger each one is for:
 *
 *   Product Launch     PLANNING, no booking yet        → request a venue (new request)
 *   Annual Conference  APPROVED at Harbour Hall + Liam's Studio,
 *                      pending change: new day/time and 150 → 220 people
 *                                                     → approve the change (date/time/attendance)
 *   Leadership Forum   APPROVED at Garden Room,
 *                      pending change: 80 → 120 people → approve the change (attendance only)
 *   Charity Gala       APPROVED at Garden Room, REQUESTED at Harbour Hall,
 *                      REQUESTED at Liam's Studio      → `-- cancel` (event cancelled)
 *   Board Retreat      HELD at Harbour Hall, expires in 5 minutes → expiring, then expired
 *   Team Offsite       HELD at Garden Room, expires in 6 hours    → expiring
 *   Studio Session     HELD at Liam's Studio, expires in 3 hours  → Liam only
 *
 * The hold notices come from the API's once-a-minute expiry job, so they only
 * arrive while `npm run dev` is running.
 *
 * Usage:
 *   npm run prisma:seed:us40             set up (re-runnable: deletes the
 *                                        previous run first, times are relative to now)
 *   npm run prisma:seed:us40 -- cancel   cancel the Charity Gala through
 *                                        EventsService.setStatus — there is no
 *                                        cancel button until US-43
 *
 * Refuses to run against a non-local database.
 */
import 'dotenv/config';

import {
  BookingDecisionKind,
  BookingStatus,
  ChangeRequestStatus,
  EventStatus,
  PrismaClient,
  RoomLayout,
  VenueStatus,
} from '@prisma/client';

const PREFIX = '[US-40]';

const host = new URL(process.env.DATABASE_URL ?? '').hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`Refusing to seed US-40 test data: DATABASE_URL points at "${host}", not a local database.`);
  process.exit(1);
}

const prisma = new PrismaClient();

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** Local time `hh:mm` on the day `days` from today. */
function at(days: number, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(Date.now() + days * DAY);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Now, rounded down to the minute, plus `minutes`. */
function fromNow(minutes: number): Date {
  return new Date(Math.floor(Date.now() / MINUTE) * MINUTE + minutes * MINUTE);
}

type VenueKey = 'harbour' | 'garden' | 'studio';

interface SeedBooking {
  venue: VenueKey;
  status: BookingStatus;
  /** HELD only. */
  holdExpiresAt?: Date;
}

interface SeedEvent {
  name: string;
  start: Date;
  end: Date;
  attendance: number;
  bookings: SeedBooking[];
  change?: { reason: string; start?: Date; end?: Date; attendance?: number };
}

const VENUES: { key: VenueKey; name: string; capacity: number; manager: 'venue' | 'venue2' }[] = [
  { key: 'harbour', name: `${PREFIX} Harbour Hall`, capacity: 300, manager: 'venue' },
  { key: 'garden', name: `${PREFIX} Garden Room`, capacity: 150, manager: 'venue' },
  { key: 'studio', name: `${PREFIX} Liam's Studio`, capacity: 300, manager: 'venue2' },
];

const EVENTS: SeedEvent[] = [
  { name: 'Product Launch', start: at(20, '10:00'), end: at(20, '13:00'), attendance: 120, bookings: [] },
  {
    name: 'Annual Conference',
    start: at(14, '09:00'),
    end: at(14, '17:00'),
    attendance: 150,
    bookings: [
      { venue: 'harbour', status: BookingStatus.APPROVED },
      { venue: 'studio', status: BookingStatus.APPROVED },
    ],
    change: {
      reason: 'Keynote speaker can only make the following day; more sign-ups than expected.',
      start: at(15, '10:00'),
      end: at(15, '18:00'),
      attendance: 220,
    },
  },
  {
    name: 'Leadership Forum',
    start: at(16, '13:00'),
    end: at(16, '16:00'),
    attendance: 80,
    bookings: [{ venue: 'garden', status: BookingStatus.APPROVED }],
    change: { reason: 'Opened to all team leads.', attendance: 120 },
  },
  {
    name: 'Charity Gala',
    start: at(18, '18:00'),
    end: at(18, '23:00'),
    attendance: 100,
    bookings: [
      { venue: 'garden', status: BookingStatus.APPROVED },
      { venue: 'harbour', status: BookingStatus.REQUESTED },
      { venue: 'studio', status: BookingStatus.REQUESTED },
    ],
  },
  {
    name: 'Board Retreat',
    start: at(6, '09:00'),
    end: at(6, '12:00'),
    attendance: 20,
    bookings: [{ venue: 'harbour', status: BookingStatus.HELD, holdExpiresAt: fromNow(5) }],
  },
  {
    name: 'Team Offsite',
    start: at(5, '09:00'),
    end: at(5, '17:00'),
    attendance: 40,
    bookings: [{ venue: 'garden', status: BookingStatus.HELD, holdExpiresAt: fromNow(6 * 60) }],
  },
  {
    name: 'Studio Session',
    start: at(5, '14:00'),
    end: at(5, '16:00'),
    attendance: 10,
    bookings: [{ venue: 'studio', status: BookingStatus.HELD, holdExpiresAt: fromNow(3 * 60) }],
  },
];

const CANCELLED_EVENT = `${PREFIX} Charity Gala`;

async function users() {
  const [organiser, coordinator, venue, venue2] = await Promise.all(
    [
      'organiser@connectsphere.local',
      'coordinator@connectsphere.local',
      'venue@connectsphere.local',
      'venue2@connectsphere.local',
    ].map((email) => prisma.user.findUniqueOrThrow({ where: { email } })),
  );
  return { organiser, coordinator, venue, venue2 };
}

async function setUp() {
  const { organiser, coordinator, venue: aisha, venue2: liam } = await users();
  const managers = { venue: aisha, venue2: liam };

  // Clean up the previous run. Events first: their bookings reference the
  // venues; they cascade to bookings, decisions, change requests and notifications.
  const events = await prisma.eventRequest.deleteMany({ where: { name: { startsWith: PREFIX } } });
  const venues = await prisma.venue.deleteMany({ where: { name: { startsWith: PREFIX } } });
  console.log(`removed previous run: ${events.count} events, ${venues.count} venues`);

  const venueIds = {} as Record<VenueKey, string>;
  for (const v of VENUES) {
    const venue = await prisma.venue.create({
      data: {
        name: v.name,
        location: 'US-40 test building',
        capacity: v.capacity,
        facilities: ['POWER_OUTLETS'],
        accessibilityFeatures: ['STEP_FREE_ACCESS'],
        supportedLayouts: [RoomLayout.THEATRE],
        operatingInfo: 'Every day, 00:00–24:00',
        status: VenueStatus.PUBLISHED,
        setupMinutes: 0,
        turnaroundMinutes: 0,
        managedById: managers[v.manager].id,
      },
    });
    venueIds[v.key] = venue.id;
  }

  for (const e of EVENTS) {
    const event = await prisma.eventRequest.create({
      data: {
        organiserId: organiser.id,
        coordinatorId: coordinator.id,
        name: `${PREFIX} ${e.name}`,
        purpose: 'US-40 venue notification testing',
        description: 'Seeded by prisma/seed-us40.ts.',
        category: 'Testing',
        proposedStart: e.start,
        proposedEnd: e.end,
        expectedAttendance: e.attendance,
        preferredLayout: RoomLayout.THEATRE,
        status: EventStatus.PLANNING,
      },
    });

    for (const b of e.bookings) {
      const manager = managers[VENUES.find((v) => v.key === b.venue)!.manager];
      const booking = await prisma.venueBooking.create({
        data: {
          eventId: event.id,
          venueId: venueIds[b.venue],
          start: e.start,
          end: e.end,
          status: b.status,
          requestedById: coordinator.id,
          expectedAttendance: e.attendance,
          preferredLayout: RoomLayout.THEATRE,
          ...(b.status === BookingStatus.HELD ? { holdExpiresAt: b.holdExpiresAt, heldById: manager.id } : {}),
        },
      });

      if (b.status === BookingStatus.APPROVED) {
        await prisma.bookingDecision.create({
          data: {
            bookingId: booking.id,
            decidedById: manager.id,
            kind: BookingDecisionKind.DECISION,
            outcome: BookingStatus.APPROVED,
          },
        });
      }
    }

    if (e.change) {
      await prisma.eventChangeRequest.create({
        data: {
          eventId: event.id,
          requestedById: organiser.id,
          status: ChangeRequestStatus.PENDING,
          reason: e.change.reason,
          proposedStart: e.change.start ?? null,
          proposedEnd: e.change.end ?? null,
          proposedAttendance: e.change.attendance ?? null,
        },
      });
    }

    console.log(`created: ${event.name} (${e.bookings.map((b) => `${b.status} ${b.venue}`).join(', ') || 'no bookings'})`);
  }
}

/** Cancel the Charity Gala the way US-43 will: through EventsService.setStatus. */
async function cancel() {
  // Keep the app's hold-expiry cron out of this short-lived process.
  process.env.NODE_ENV = 'test';
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../src/app.module');
  const { EventsService } = require('../src/events/events.service');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const { coordinator } = await users();
  const event = await prisma.eventRequest.findFirst({ where: { name: CANCELLED_EVENT } });
  if (!event) {
    throw new Error(`"${CANCELLED_EVENT}" not found — run npm run prisma:seed:us40 first.`);
  }
  if (event.status === EventStatus.CANCELLED) {
    console.log(`"${CANCELLED_EVENT}" is already cancelled — re-run the setup to start again.`);
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    await app.get(EventsService).setStatus(event, EventStatus.CANCELLED, undefined, coordinator.id);
  } finally {
    await app.close();
  }

  const released = await prisma.venueBooking.count({
    where: { eventId: event.id, status: BookingStatus.RELEASED },
  });
  console.log(`cancelled "${CANCELLED_EVENT}"; ${released} venue bookings released and their managers notified`);
}

(process.argv[2] === 'cancel' ? cancel() : setUp())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
