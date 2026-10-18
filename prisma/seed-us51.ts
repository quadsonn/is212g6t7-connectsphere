/**
 * US-51 — test data for "Flag bookings that conflict after buffer changes".
 *
 * Creates two venues managed by venue@connectsphere.local, both with 0/0
 * buffers, and the bookings each AC needs:
 *
 *   [US-51] Test Hall   — clashes appear as buffers go up
 *     Day +10  Morning Lecture  09:00–11:00  APPROVED   ┐ 15 min gap
 *              Workshop         11:15–12:30  REQUESTED  ┤ 30 min gap
 *              Panel            13:00–15:00  APPROVED   ┤ 60 min gap
 *              Evening Talk     16:00–18:00  REQUESTED  ┘
 *     Day +11  Rejected Pitch   09:00–10:00  REJECTED   — ignored (not live)
 *              Demo Day         10:10–12:00  APPROVED   — so never clashes
 *     Day +12  Overlap A        13:00–15:00  REQUESTED  ┐ already overlap at
 *              Overlap B        14:00–16:00  REQUESTED  ┘ 0/0: never listed
 *     Day −1   Past Seminar     09:00–11:00  APPROVED   ┐ 10 min gap, but both
 *              Past Social      11:10–12:00  APPROVED   ┘ finished (AC-2)
 *     Now      In-Progress Talk now−60m → now+60m APPROVED  ┐ 15 min gap: listed
 *              Next Session     now+75m → now+3h  REQUESTED ┘ as partner only
 *
 *   [US-51] Quiet Room  — no clashes unless setup + turnaround > 5 hours
 *     Day +10  Quiet Morning    09:00–10:00  APPROVED
 *              Quiet Afternoon  15:00–16:00  APPROVED
 *
 * A gap clashes when setup + turnaround exceeds it (touching is fine), so on
 * the Test Hall: 10/10 → 1 new pair, 20/20 → 2, 45/45 → 3 plus the
 * in-progress pair. Times are in this machine's local time zone.
 *
 * Re-runnable: deletes everything it created before (events cascade to their
 * bookings, decisions and notifications), then recreates it. Re-run before
 * each test pass — it resets the buffers and flags, and the in-progress pair
 * is relative to now. Refuses to run against a non-local database.
 *
 * Usage: npm run prisma:seed:us51
 */
import 'dotenv/config';

import { BookingDecisionKind, BookingStatus, EventStatus, PrismaClient, RoomLayout, VenueStatus } from '@prisma/client';

const PREFIX = '[US-51]';

const host = new URL(process.env.DATABASE_URL ?? '').hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`Refusing to seed US-51 test data: DATABASE_URL points at "${host}", not a local database.`);
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

interface SeedBooking {
  event: string;
  start: Date;
  end: Date;
  status: BookingStatus;
}

const VENUES: { name: string; capacity: number; bookings: SeedBooking[] }[] = [
  {
    name: `${PREFIX} Test Hall`,
    capacity: 200,
    bookings: [
      { event: 'Morning Lecture', start: at(10, '09:00'), end: at(10, '11:00'), status: BookingStatus.APPROVED },
      { event: 'Workshop', start: at(10, '11:15'), end: at(10, '12:30'), status: BookingStatus.REQUESTED },
      { event: 'Panel', start: at(10, '13:00'), end: at(10, '15:00'), status: BookingStatus.APPROVED },
      { event: 'Evening Talk', start: at(10, '16:00'), end: at(10, '18:00'), status: BookingStatus.REQUESTED },

      { event: 'Rejected Pitch', start: at(11, '09:00'), end: at(11, '10:00'), status: BookingStatus.REJECTED },
      { event: 'Demo Day', start: at(11, '10:10'), end: at(11, '12:00'), status: BookingStatus.APPROVED },

      { event: 'Overlap A', start: at(12, '13:00'), end: at(12, '15:00'), status: BookingStatus.REQUESTED },
      { event: 'Overlap B', start: at(12, '14:00'), end: at(12, '16:00'), status: BookingStatus.REQUESTED },

      { event: 'Past Seminar', start: at(-1, '09:00'), end: at(-1, '11:00'), status: BookingStatus.APPROVED },
      { event: 'Past Social', start: at(-1, '11:10'), end: at(-1, '12:00'), status: BookingStatus.APPROVED },

      { event: 'In-Progress Talk', start: fromNow(-60), end: fromNow(60), status: BookingStatus.APPROVED },
      { event: 'Next Session', start: fromNow(75), end: fromNow(180), status: BookingStatus.REQUESTED },
    ],
  },
  {
    name: `${PREFIX} Quiet Room`,
    capacity: 40,
    bookings: [
      { event: 'Quiet Morning', start: at(10, '09:00'), end: at(10, '10:00'), status: BookingStatus.APPROVED },
      { event: 'Quiet Afternoon', start: at(10, '15:00'), end: at(10, '16:00'), status: BookingStatus.APPROVED },
    ],
  },
];

async function main() {
  const [organiser, coordinator, venueStaff] = await Promise.all(
    ['organiser@connectsphere.local', 'coordinator@connectsphere.local', 'venue@connectsphere.local'].map((email) =>
      prisma.user.findUniqueOrThrow({ where: { email } }),
    ),
  );

  // Clean up the previous run. Events first: their bookings reference the venues.
  const events = await prisma.eventRequest.deleteMany({ where: { name: { startsWith: PREFIX } } });
  const venues = await prisma.venue.deleteMany({ where: { name: { startsWith: PREFIX } } });
  console.log(`removed previous run: ${events.count} events, ${venues.count} venues`);

  for (const v of VENUES) {
    const venue = await prisma.venue.create({
      data: {
        name: v.name,
        location: 'US-51 test building',
        capacity: v.capacity,
        facilities: ['POWER_OUTLETS'],
        accessibilityFeatures: ['STEP_FREE_ACCESS'],
        supportedLayouts: [RoomLayout.THEATRE],
        operatingInfo: 'Every day, 00:00–24:00',
        status: VenueStatus.PUBLISHED,
        setupMinutes: 0,
        turnaroundMinutes: 0,
        managedById: venueStaff.id,
      },
    });

    for (const b of v.bookings) {
      const event = await prisma.eventRequest.create({
        data: {
          organiserId: organiser.id,
          coordinatorId: coordinator.id,
          name: `${PREFIX} ${b.event}`,
          purpose: 'US-51 buffer clash testing',
          description: 'Seeded by prisma/seed-us51.ts.',
          category: 'Testing',
          proposedStart: b.start,
          proposedEnd: b.end,
          expectedAttendance: 30,
          preferredLayout: RoomLayout.THEATRE,
          status: EventStatus.PLANNING,
        },
      });

      const booking = await prisma.venueBooking.create({
        data: {
          eventId: event.id,
          venueId: venue.id,
          start: b.start,
          end: b.end,
          status: b.status,
          requestedById: coordinator.id,
          expectedAttendance: 30,
          preferredLayout: RoomLayout.THEATRE,
          decisionReason: b.status === BookingStatus.REJECTED ? 'Seeded rejection' : null,
        },
      });

      // Decided bookings get the decision row the history would have.
      if (b.status !== BookingStatus.REQUESTED) {
        await prisma.bookingDecision.create({
          data: {
            bookingId: booking.id,
            decidedById: venueStaff.id,
            kind: BookingDecisionKind.DECISION,
            outcome: b.status,
            reason: booking.decisionReason,
          },
        });
      }
    }

    console.log(`created: ${v.name} with ${v.bookings.length} bookings`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
