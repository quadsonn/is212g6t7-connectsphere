/**
 * US-64 — demo data for "notify all Safety Officers when an event enters
 * AWAITING_SAFETY_CHECK".
 *
 * Three PLANNING events, organised by organiser@ (Priya) and assigned to
 * coordinator@ (Marcus), one for each way an event can (or cannot) reach the
 * Safety queue:
 *
 *   1 Ready to confirm          venue APPROVED                        → Confirm; every Safety Officer
 *                                                                       gets "Safety check due: …"
 *   2 Sent back after changes   venue APPROVED, safety@ asked for     → "Send back for safety check";
 *                               changes, and the plan has changed since  every Safety Officer gets
 *                                                                       "Safety check due: …" again
 *   3 Not ready                 venue REQUESTED                       → Confirm disabled; nobody is told
 *
 * The venue, [US-64] Seminar Room, is managed by venue@ (Aisha). Every user
 * with the Safety Officer role is a recipient: safety@ (Kofi), and safety2@
 * (Mei) once `npm run prisma:seed:roles` has added her.
 *
 * Re-runnable: deletes every event named [US-64] (and its bookings, reviews,
 * history and notifications, by cascade) and its venue, then recreates them.
 * Refuses to run against a non-local database.
 *
 * Usage: npm run prisma:seed:us64
 */
import 'dotenv/config';

import {
  BookingDecisionKind,
  BookingStatus,
  EventStatus,
  PrismaClient,
  Role,
  RoomLayout,
  SafetyOutcome,
  SafetyReturnStage,
  User,
  VenueStatus,
} from '@prisma/client';

const PREFIX = '[US-64]';
const FRONTEND = 'http://localhost:5173';

const host = new URL(process.env.DATABASE_URL ?? '').hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`Refusing to seed US-64 test data: DATABASE_URL points at "${host}", not a local database.`);
  process.exit(1);
}

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/** Local time `hh:mm` on the day `days` from today. */
function at(days: number, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(Date.now() + days * DAY);
  d.setHours(h, m, 0, 0);
  return d;
}

interface SeedEvent {
  name: string;
  day: number;
  booking: BookingStatus;
  /** A safety review asking for changes, answered by a planning edit since. */
  changesRequested?: boolean;
  /** What to do and look at, printed at the end. */
  demo: string;
}

const EVENTS: SeedEvent[] = [
  {
    name: '1 Ready to confirm',
    day: 15,
    booking: BookingStatus.APPROVED,
    demo: 'coordinator@ presses Confirm → each Safety Officer gets "Safety check due: [US-64] 1 Ready to confirm on <date>"',
  },
  {
    name: '2 Sent back after changes',
    day: 16,
    booking: BookingStatus.APPROVED,
    changesRequested: true,
    demo: 'coordinator@ sends it back for a safety check → each Safety Officer gets "Safety check due: [US-64] 2 Sent back after changes on <date>"',
  },
  {
    name: '3 Not ready',
    day: 17,
    booking: BookingStatus.REQUESTED,
    demo: 'venue still pending: Confirm disabled, and no Safety Officer is notified',
  },
];

async function main() {
  const users = Object.fromEntries(
    await Promise.all(
      (['organiser', 'coordinator', 'venue', 'safety'] as const).map(async (key) => [
        key,
        await prisma.user.findUniqueOrThrow({ where: { email: `${key}@connectsphere.local` } }),
      ]),
    ),
  ) as Record<'organiser' | 'coordinator' | 'venue' | 'safety', User>;

  const officers = await prisma.user.findMany({
    where: { role: Role.SAFETY_OFFICER },
    select: { email: true },
    orderBy: { email: 'asc' },
  });

  // Events first: they cascade to their bookings, decisions, safety reviews,
  // history and notifications, which reference the venue.
  const events = await prisma.eventRequest.deleteMany({
    where: {
      OR: [
        { name: { startsWith: PREFIX } },
        { venueBookings: { some: { venue: { name: { startsWith: PREFIX } } } } },
      ],
    },
  });
  const venues = await prisma.venue.deleteMany({ where: { name: { startsWith: PREFIX } } });
  console.log(`removed previous run: ${events.count} events, ${venues.count} venues`);

  const venue = await prisma.venue.create({
    data: {
      name: `${PREFIX} Seminar Room`,
      location: 'US-64 demo building',
      capacity: 120,
      facilities: ['POWER_OUTLETS'],
      accessibilityFeatures: ['STEP_FREE_ACCESS'],
      supportedLayouts: [RoomLayout.THEATRE],
      operatingInfo: 'Every day, 00:00–24:00',
      status: VenueStatus.PUBLISHED,
      setupMinutes: 0,
      turnaroundMinutes: 0,
      managedById: users.venue.id,
    },
  });

  const links: string[] = [];

  for (const e of EVENTS) {
    const start = at(e.day, '14:00');
    const end = at(e.day, '17:00');

    const event = await prisma.eventRequest.create({
      data: {
        organiserId: users.organiser.id,
        coordinatorId: users.coordinator.id,
        name: `${PREFIX} ${e.name}`,
        purpose: 'US-64 Safety Officer notification demo',
        description: 'Seeded by prisma/seed-us64.ts.',
        category: 'Demo',
        proposedStart: start,
        proposedEnd: end,
        expectedAttendance: 60,
        preferredLayout: RoomLayout.THEATRE,
        status: EventStatus.PLANNING,
      },
    });

    const booking = await prisma.venueBooking.create({
      data: {
        eventId: event.id,
        venueId: venue.id,
        start,
        end,
        status: e.booking,
        requestedById: users.coordinator.id,
        expectedAttendance: 60,
        preferredLayout: RoomLayout.THEATRE,
      },
    });
    if (e.booking === BookingStatus.APPROVED) {
      await prisma.bookingDecision.create({
        data: {
          bookingId: booking.id,
          decidedById: users.venue.id,
          kind: BookingDecisionKind.DECISION,
          outcome: BookingStatus.APPROVED,
        },
      });
    }

    if (e.changesRequested) {
      // The review came first; the planning edit after it is what lets the
      // Coordinator send the event back (SafetyService.resubmit refuses an
      // unchanged event).
      await prisma.safetyReview.create({
        data: {
          eventId: event.id,
          officerId: users.safety.id,
          outcome: SafetyOutcome.CHANGES_REQUESTED,
          returnStage: SafetyReturnStage.VENUE,
          reason: 'Only one exit is marked on the layout. Add a second exit route.',
          createdAt: new Date(Date.now() - 2 * HOUR),
        },
      });
      await prisma.eventChange.create({
        data: {
          eventId: event.id,
          changedById: users.coordinator.id,
          changes: [{ field: 'layoutNotes', previous: null, next: 'Second exit added at the rear' }],
          createdAt: new Date(Date.now() - HOUR),
        },
      });
      await prisma.eventRequest.update({
        where: { id: event.id },
        data: { layoutNotes: 'Second exit added at the rear' },
      });
    }

    links.push(
      `${event.name}\n    ${e.demo}\n    coordinator: ${FRONTEND}/coordinator/events/${event.id}\n    safety:      ${FRONTEND}/safety/checks/${event.id}`,
    );
  }

  console.log(`\ncreated ${EVENTS.length} events on ${venue.name}:\n\n${links.join('\n\n')}`);
  console.log(
    `\nSafety Officers who will be notified (${officers.length}): ${officers.map((o) => o.email).join(', ')}`,
  );
  if (officers.length < 2) {
    console.log('Only one Safety Officer: run `npm run prisma:seed:roles` to add safety2@ and see every officer told.');
  }
  console.log(`Check each officer's bell, or ${FRONTEND}/notifications.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
