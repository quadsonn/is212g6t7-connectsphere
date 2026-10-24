/**
 * US-61 — test data for "Assign Technical Support Staff to an Event".
 *
 * Every event is coordinated by coordinator@ and needs on-site support
 * (technical support needs recorded). Technical Support: tech@ (Wei) and
 * tech2@ (Nadia). All on days relative to today:
 *
 *   Town Hall       day +10, 10:00–12:00, unassigned     → assign Nadia (AC-1);
 *                                                          Wei shows a conflict (AC-2)
 *   Product Launch  day +10, 11:00–13:00, Wei assigned,  → Wei's list (AC-3)
 *                   approved at [US-61] Harbour Room,
 *                   two microphones recorded
 *   Strategy Day    day +14, 09:00–17:00, unassigned     → nobody available (AC-4)
 *   Workshop A      day +14, 10:00–12:00, Wei assigned   ┐ keep everyone busy
 *   Workshop B      day +14, 13:00–15:00, Nadia assigned ┘ during Strategy Day
 *
 * Usage:
 *   npm run prisma:seed:us61    set up (re-runnable: deletes the previous run first)
 *
 * Refuses to run against a non-local database.
 */
import 'dotenv/config';

import {
  BookingDecisionKind,
  BookingStatus,
  EventStatus,
  PrismaClient,
  RoomLayout,
  VenueStatus,
} from '@prisma/client';

const PREFIX = '[US-61]';

const host = new URL(process.env.DATABASE_URL ?? '').hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`Refusing to seed US-61 test data: DATABASE_URL points at "${host}", not a local database.`);
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

type StaffKey = 'tech' | 'tech2';

interface SeedEvent {
  name: string;
  start: Date;
  end: Date;
  support: string;
  assignee?: StaffKey;
  /** An approved booking at the seed's venue. */
  booked?: boolean;
  requirements?: { equipmentType: string; quantity: number; notes?: string }[];
}

const EVENTS: SeedEvent[] = [
  {
    name: 'Town Hall',
    start: at(10, '10:00'),
    end: at(10, '12:00'),
    support: 'On-site AV technician for the CEO keynote; livestream to the regional offices.',
  },
  {
    name: 'Product Launch',
    start: at(10, '11:00'),
    end: at(10, '13:00'),
    support: 'Technician on stage for the demo; hybrid setup for remote press.',
    assignee: 'tech',
    booked: true,
    requirements: [{ equipmentType: 'Wireless microphone', quantity: 2, notes: 'Lapel, for the presenters' }],
  },
  {
    name: 'Strategy Day',
    start: at(14, '09:00'),
    end: at(14, '17:00'),
    support: 'Video-conferencing setup in the main room all day.',
  },
  {
    name: 'Workshop A',
    start: at(14, '10:00'),
    end: at(14, '12:00'),
    support: 'Projector and laptop set up before the start.',
    assignee: 'tech',
  },
  {
    name: 'Workshop B',
    start: at(14, '13:00'),
    end: at(14, '15:00'),
    support: 'Hybrid setup for remote participants.',
    assignee: 'tech2',
  },
];

async function users() {
  const [organiser, coordinator, venue, tech, tech2] = await Promise.all(
    [
      'organiser@connectsphere.local',
      'coordinator@connectsphere.local',
      'venue@connectsphere.local',
      'tech@connectsphere.local',
      'tech2@connectsphere.local',
    ].map((email) => prisma.user.findUniqueOrThrow({ where: { email } })),
  );
  return { organiser, coordinator, venue, tech, tech2 };
}

async function setUp() {
  const { organiser, coordinator, venue: aisha, tech, tech2 } = await users();
  const staff = { tech, tech2 };

  // Clean up the previous run. Events first: they cascade to their bookings,
  // requirements, history and notifications, and the bookings reference the venue.
  const events = await prisma.eventRequest.deleteMany({ where: { name: { startsWith: PREFIX } } });
  const venues = await prisma.venue.deleteMany({ where: { name: { startsWith: PREFIX } } });
  console.log(`removed previous run: ${events.count} events, ${venues.count} venues`);

  const room = await prisma.venue.create({
    data: {
      name: `${PREFIX} Harbour Room`,
      location: 'US-61 test building',
      capacity: 200,
      facilities: ['PROJECTOR', 'SOUND_SYSTEM'],
      supportedLayouts: [RoomLayout.THEATRE],
      operatingInfo: 'Every day, 00:00–24:00',
      status: VenueStatus.PUBLISHED,
      managedById: aisha.id,
    },
  });

  for (const e of EVENTS) {
    const event = await prisma.eventRequest.create({
      data: {
        organiserId: organiser.id,
        coordinatorId: coordinator.id,
        name: `${PREFIX} ${e.name}`,
        purpose: 'US-61 technical support assignment testing',
        description: 'Seeded by prisma/seed-us61.ts.',
        category: 'Testing',
        proposedStart: e.start,
        proposedEnd: e.end,
        expectedAttendance: 80,
        preferredLayout: RoomLayout.THEATRE,
        equipmentNeeds: 'A projector and microphones.',
        technicalSupportNeeds: e.support,
        technicalSupportId: e.assignee ? staff[e.assignee].id : null,
        status: EventStatus.PLANNING,
      },
    });

    for (const r of e.requirements ?? []) {
      await prisma.equipmentRequirement.create({
        data: { eventId: event.id, equipmentType: r.equipmentType, quantity: r.quantity, notes: r.notes ?? null },
      });
    }

    if (e.booked) {
      const booking = await prisma.venueBooking.create({
        data: {
          eventId: event.id,
          venueId: room.id,
          start: e.start,
          end: e.end,
          status: BookingStatus.APPROVED,
          requestedById: coordinator.id,
          expectedAttendance: 80,
          preferredLayout: RoomLayout.THEATRE,
        },
      });
      await prisma.bookingDecision.create({
        data: {
          bookingId: booking.id,
          decidedById: aisha.id,
          kind: BookingDecisionKind.DECISION,
          outcome: BookingStatus.APPROVED,
        },
      });
    }

    console.log(`created: ${event.name} (${e.assignee ? `assigned to ${staff[e.assignee].name}` : 'unassigned'})`);
  }
}

setUp()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
