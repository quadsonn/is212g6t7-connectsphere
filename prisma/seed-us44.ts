/**
 * US-44 — demo data for "Release Venue Booking on Event Cancellation".
 *
 * The Organiser cancels "[US-44] Annual Gala" with US-43's Cancel button; its
 * venue bookings are then released (US-44). All on one day, 12 days from now:
 *
 *   [US-44] Grand Hall      (venue@, Aisha)
 *     09:00–12:00  Morning Workshop  APPROVED   ← a neighbour: never touched (AC-6)
 *     14:00–17:00  Annual Gala       REJECTED   ← already refused: stays REJECTED
 *     18:00–23:00  Annual Gala       APPROVED   ← confirmed  → RELEASED
 *   [US-44] Garden Terrace  (venue@, Aisha)
 *     18:00–23:00  Annual Gala       HELD       ← tentative  → RELEASED
 *   [US-44] Seminar Room    (venue2@, Liam)
 *     18:00–23:00  Annual Gala       REQUESTED  ← pending    → RELEASED
 *
 * "[US-44] Charity Auction" (PLANNING, no venue yet) wants Grand Hall at
 * 18:00–23:00 the same day: before the cancellation the slot is taken; after
 * it, the Coordinator finds it free in search and the calendar and can
 * request it (AC-2).
 *
 * Every event is organised by organiser@ and coordinated by coordinator@.
 * Re-runnable: deletes everything it created before — including any event
 * booked on its venues, even one renamed since — then recreates it. Refuses to
 * run against a non-local database.
 *
 * Usage: npm run prisma:seed:us44
 */
import 'dotenv/config';

import {
  BookingDecisionKind,
  BookingStatus,
  EventStatus,
  PrismaClient,
  RoomLayout,
  User,
  VenueStatus,
} from '@prisma/client';

const PREFIX = '[US-44]';
const FRONTEND = 'http://localhost:5173';
const DAY_OFFSET = 12;

const host = new URL(process.env.DATABASE_URL ?? '').hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`Refusing to seed US-44 test data: DATABASE_URL points at "${host}", not a local database.`);
  process.exit(1);
}

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;

/** Local time `hh:mm` on the demo day. */
function at(time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(Date.now() + DAY_OFFSET * DAY);
  d.setHours(h, m, 0, 0);
  return d;
}

type VenueKey = 'hall' | 'terrace' | 'seminar';

const VENUES: { key: VenueKey; name: string; capacity: number; manager: 'venue' | 'venue2' }[] = [
  { key: 'hall', name: `${PREFIX} Grand Hall`, capacity: 300, manager: 'venue' },
  { key: 'terrace', name: `${PREFIX} Garden Terrace`, capacity: 150, manager: 'venue' },
  { key: 'seminar', name: `${PREFIX} Seminar Room`, capacity: 120, manager: 'venue2' },
];

async function main() {
  const users = Object.fromEntries(
    await Promise.all(
      (['organiser', 'coordinator', 'venue', 'venue2'] as const).map(async (key) => [
        key,
        await prisma.user.findUniqueOrThrow({ where: { email: `${key}@connectsphere.local` } }),
      ]),
    ),
  ) as Record<'organiser' | 'coordinator' | 'venue' | 'venue2', User>;

  // Clean up the previous run. Events first: they cascade to their bookings,
  // decisions and notifications, which reference the venues. Any event booked
  // on the venues goes too, even if renamed since, or it would block them.
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

  const venueIds = {} as Record<VenueKey, string>;
  for (const v of VENUES) {
    const venue = await prisma.venue.create({
      data: {
        name: v.name,
        location: 'US-44 demo building',
        capacity: v.capacity,
        facilities: ['POWER_OUTLETS'],
        accessibilityFeatures: ['STEP_FREE_ACCESS'],
        supportedLayouts: [RoomLayout.THEATRE, RoomLayout.BANQUET],
        operatingInfo: 'Every day, 00:00–24:00',
        status: VenueStatus.PUBLISHED,
        setupMinutes: 0,
        turnaroundMinutes: 0,
        managedById: users[v.manager].id,
      },
    });
    venueIds[v.key] = venue.id;
  }

  const createEvent = (name: string, start: Date, end: Date, attendance: number) =>
    prisma.eventRequest.create({
      data: {
        organiserId: users.organiser.id,
        coordinatorId: users.coordinator.id,
        name: `${PREFIX} ${name}`,
        purpose: 'US-44 release-on-cancellation demo',
        description: 'Seeded by prisma/seed-us44.ts.',
        category: 'Demo',
        proposedStart: start,
        proposedEnd: end,
        expectedAttendance: attendance,
        preferredLayout: RoomLayout.BANQUET,
        status: EventStatus.PLANNING,
      },
    });

  const book = async (
    eventId: string,
    venue: VenueKey,
    start: Date,
    end: Date,
    status: BookingStatus,
    attendance: number,
  ) => {
    const manager = users[VENUES.find((v) => v.key === venue)!.manager];
    const booking = await prisma.venueBooking.create({
      data: {
        eventId,
        venueId: venueIds[venue],
        start,
        end,
        status,
        requestedById: users.coordinator.id,
        expectedAttendance: attendance,
        preferredLayout: RoomLayout.BANQUET,
        decisionReason: status === BookingStatus.REJECTED ? 'Afternoon slot needed for setup elsewhere' : null,
        // A live hold: expires in 3 days, well before the event.
        ...(status === BookingStatus.HELD
          ? { holdExpiresAt: new Date(Date.now() + 3 * DAY), heldById: manager.id }
          : {}),
      },
    });
    if (status === BookingStatus.APPROVED || status === BookingStatus.REJECTED) {
      await prisma.bookingDecision.create({
        data: {
          bookingId: booking.id,
          decidedById: manager.id,
          kind: BookingDecisionKind.DECISION,
          outcome: status,
          reason: booking.decisionReason,
        },
      });
    }
    return booking;
  };

  const workshop = await createEvent('Morning Workshop', at('09:00'), at('12:00'), 60);
  await book(workshop.id, 'hall', at('09:00'), at('12:00'), BookingStatus.APPROVED, 60);

  const gala = await createEvent('Annual Gala', at('18:00'), at('23:00'), 120);
  await book(gala.id, 'hall', at('14:00'), at('17:00'), BookingStatus.REJECTED, 120);
  const confirmed = await book(gala.id, 'hall', at('18:00'), at('23:00'), BookingStatus.APPROVED, 120);
  const held = await book(gala.id, 'terrace', at('18:00'), at('23:00'), BookingStatus.HELD, 120);
  const pending = await book(gala.id, 'seminar', at('18:00'), at('23:00'), BookingStatus.REQUESTED, 120);

  const auction = await createEvent('Charity Auction', at('18:00'), at('23:00'), 100);

  const day = at('00:00').toDateString();
  console.log(`
created on ${day}:
  ${PREFIX} Annual Gala      — Grand Hall APPROVED, Garden Terrace HELD, Seminar Room REQUESTED (+1 REJECTED)
  ${PREFIX} Morning Workshop — Grand Hall APPROVED 09:00–12:00 (the neighbour)
  ${PREFIX} Charity Auction  — no venue; wants Grand Hall 18:00–23:00

cancel the Gala (organiser@):     ${FRONTEND}/organiser/${gala.id}
its bookings (venue@ / venue2@):  ${FRONTEND}/venues/bookings/${confirmed.id}
                                  ${FRONTEND}/venues/bookings/${held.id}
                                  ${FRONTEND}/venues/bookings/${pending.id}   (venue2@)
the Auction (coordinator@):       ${FRONTEND}/coordinator/events/${auction.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
