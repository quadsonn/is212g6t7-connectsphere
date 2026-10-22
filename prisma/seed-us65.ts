/**
 * US-65 — demo data for "notify the Organiser when a Coordinator is assigned,
 * and confirm the Organiser's own cancellation".
 *
 * Three events, organised by organiser@ (Priya):
 *
 *   1 Waiting for a coordinator   SUBMITTED, unassigned         → lead@ assigns it from the unassigned
 *                                                                  queue; organiser@ gets "<name> is now
 *                                                                  the coordinator for …"
 *   2 Changing coordinator        PLANNING, coordinator@ (Marcus) → lead@ reassigns it to coordinator2@;
 *                                                                  organiser@ gets "Your coordinator for …
 *                                                                  is now <name>."
 *   3 Cancel me                   CONFIRMED, venue booked,        → organiser@ cancels it; the page lists
 *                                 2 equipment reservations,         what was released, and organiser@ gets
 *                                 1 registered attendee             "You cancelled …" with the reason
 *
 * The venue, [US-65] Function Room, is managed by venue@; the equipment item is
 * [US-65] Wireless Microphone. attendee@ is registered for event 3.
 *
 * Re-runnable: deletes every event named [US-65] (and everything hanging off
 * it, by cascade), its venue and equipment, then recreates them. Refuses to run
 * against a non-local database.
 *
 * Usage: npm run prisma:seed:us65
 */
import 'dotenv/config';

import {
  BookingDecisionKind,
  BookingStatus,
  EventStatus,
  PrismaClient,
  ReservationStatus,
  RoomLayout,
  User,
  VenueStatus,
} from '@prisma/client';

const PREFIX = '[US-65]';
const FRONTEND = 'http://localhost:5173';

const host = new URL(process.env.DATABASE_URL ?? '').hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`Refusing to seed US-65 test data: DATABASE_URL points at "${host}", not a local database.`);
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

const USERS = ['organiser', 'coordinator', 'coordinator2', 'venue', 'attendee', 'lead'] as const;
type UserKey = (typeof USERS)[number];

async function main() {
  const users = Object.fromEntries(
    await Promise.all(
      USERS.map(async (key) => [
        key,
        await prisma.user.findUniqueOrThrow({ where: { email: `${key}@connectsphere.local` } }),
      ]),
    ),
  ) as Record<UserKey, User>;

  // Events first: they cascade to their bookings, reservations, registrations,
  // history and notifications, which reference the venue and equipment.
  const events = await prisma.eventRequest.deleteMany({
    where: {
      OR: [
        { name: { startsWith: PREFIX } },
        { venueBookings: { some: { venue: { name: { startsWith: PREFIX } } } } },
        { equipmentReservations: { some: { equipment: { type: { startsWith: PREFIX } } } } },
      ],
    },
  });
  const venues = await prisma.venue.deleteMany({ where: { name: { startsWith: PREFIX } } });
  const items = await prisma.equipment.deleteMany({ where: { type: { startsWith: PREFIX } } });
  console.log(`removed previous run: ${events.count} events, ${venues.count} venues, ${items.count} equipment items`);

  const venue = await prisma.venue.create({
    data: {
      name: `${PREFIX} Function Room`,
      location: 'US-65 demo building',
      capacity: 150,
      facilities: ['POWER_OUTLETS'],
      accessibilityFeatures: ['STEP_FREE_ACCESS'],
      supportedLayouts: [RoomLayout.BANQUET],
      operatingInfo: 'Every day, 00:00–24:00',
      status: VenueStatus.PUBLISHED,
      setupMinutes: 0,
      turnaroundMinutes: 0,
      managedById: users.venue.id,
    },
  });
  const mic = await prisma.equipment.create({
    data: {
      type: `${PREFIX} Wireless Microphone`,
      description: 'Handheld wireless microphone',
      location: 'AV store, level 1',
      totalQuantity: 10,
    },
  });

  const base = (name: string, day: number) => ({
    organiserId: users.organiser.id,
    name: `${PREFIX} ${name}`,
    purpose: 'US-65 Organiser notification demo',
    description: 'Seeded by prisma/seed-us65.ts.',
    category: 'Demo',
    proposedStart: at(day, '18:00'),
    proposedEnd: at(day, '21:00'),
    expectedAttendance: 80,
    preferredLayout: RoomLayout.BANQUET,
  });

  // 1: in the Lead's unassigned queue.
  const queued = await prisma.eventRequest.create({
    data: { ...base('1 Waiting for a coordinator', 20), status: EventStatus.SUBMITTED, submittedAt: new Date() },
  });

  // 2: assigned to Marcus, ready for the Lead to hand to someone else.
  const reassignable = await prisma.eventRequest.create({
    data: {
      ...base('2 Changing coordinator', 21),
      coordinatorId: users.coordinator.id,
      status: EventStatus.PLANNING,
    },
  });

  // 3: confirmed and holding things, so cancelling has something to release.
  const cancellable = await prisma.eventRequest.create({
    data: {
      ...base('3 Cancel me', 22),
      coordinatorId: users.coordinator.id,
      status: EventStatus.CONFIRMED,
      registrationEnabled: true,
    },
  });
  const start = cancellable.proposedStart!;
  const end = cancellable.proposedEnd!;
  const booking = await prisma.venueBooking.create({
    data: {
      eventId: cancellable.id,
      venueId: venue.id,
      start,
      end,
      status: BookingStatus.APPROVED,
      requestedById: users.coordinator.id,
      expectedAttendance: 80,
      preferredLayout: RoomLayout.BANQUET,
    },
  });
  await prisma.bookingDecision.create({
    data: {
      bookingId: booking.id,
      decidedById: users.venue.id,
      kind: BookingDecisionKind.DECISION,
      outcome: BookingStatus.APPROVED,
    },
  });
  for (const quantity of [2, 3]) {
    await prisma.equipmentReservation.create({
      data: { eventId: cancellable.id, equipmentId: mic.id, quantity, start, end, status: ReservationStatus.APPROVED },
    });
  }
  await prisma.registration.create({
    data: { eventId: cancellable.id, attendeeId: users.attendee.id, phone: '+6591234567' },
  });

  console.log(`
created 3 events:

${queued.name}
    lead@ assigns it to a coordinator → organiser@ is told who
    lead:      ${FRONTEND}/lead/unassigned/${queued.id}

${reassignable.name}
    lead@ reassigns it from Marcus to coordinator2@ → organiser@ is told the new name
    lead:      ${FRONTEND}/lead/assignments

${cancellable.name}
    organiser@ cancels it → the page lists 1 venue booking and 2 equipment reservations released;
    organiser@ gets "You cancelled …" with the reason; coordinator@ and attendee@ get the usual notice
    organiser: ${FRONTEND}/organiser/${cancellable.id}

Then check organiser@'s bell, or ${FRONTEND}/notifications.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
