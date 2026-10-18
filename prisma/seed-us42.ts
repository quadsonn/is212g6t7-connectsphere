/**
 * US-42 — demo data for "Confirm Event When Arrangements Are Ready".
 *
 * Seven PLANNING events, organised by organiser@ (Priya). Each of 1–5 shows
 * one case on the Coordinator's "Confirm arrangements" card; 6 is assigned to
 * someone else; 7 starts with everything outstanding, to fix live:
 *
 *   1 Pending venue         venue REQUESTED                   → "still pending", Confirm disabled
 *   2 Venue on hold         venue HELD (tentative)            → "on hold", Confirm disabled
 *   3 Projector missing     venue APPROVED, projector 0 of 2  → "Projector not reserved (0 of 2)"
 *   4 No equipment needed   venue APPROVED, no requirements   → Confirm enabled
 *   5 Ready to confirm      venue APPROVED, projector 2 of 2,
 *                           stage lighting ticked by hand     → Confirm enabled
 *   6 Fatima's event        as 5, but assigned to coordinator2@ → coordinator@ cannot confirm
 *   7 Walk-through          venue REQUESTED, projector 0 of 2, microphones 0 of 4,
 *                           stage lighting not checked        → fix each live, then confirm
 *
 * Events 1–5 and 7 are assigned to coordinator@ (Marcus). The venue,
 * [US-42] Lecture Theatre, is managed by venue@ (Aisha); the equipment items,
 * [US-42] Projector and [US-42] Wireless Microphone, are reserved by tech@.
 *
 * Confirming moves the event to "Arrangements confirmed - awaiting safety
 * review" (requirement change #6), which the Organiser sees on their event.
 *
 * Re-runnable: deletes everything it created before — including any event
 * booked on its venue or using its equipment, even one renamed since — then
 * recreates it. Refuses to run against a non-local database.
 *
 * Usage: npm run prisma:seed:us42
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

const PREFIX = '[US-42]';
const FRONTEND = 'http://localhost:5173';

const host = new URL(process.env.DATABASE_URL ?? '').hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`Refusing to seed US-42 test data: DATABASE_URL points at "${host}", not a local database.`);
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

type Item = 'projector' | 'microphone';

interface SeedEvent {
  name: string;
  day: number;
  coordinator: 'coordinator' | 'coordinator2';
  booking: BookingStatus;
  /** Catalogue lines: how many are needed, and how many are already reserved. */
  equipment?: { item: Item; needed: number; reserved: number }[];
  /** A free-text line (no catalogue item), ticked by hand or not. */
  freeText?: { type: string; checked: boolean };
  /** What to look at, printed at the end. */
  demo: string;
}

const EVENTS: SeedEvent[] = [
  {
    name: '1 Pending venue',
    day: 8,
    coordinator: 'coordinator',
    booking: BookingStatus.REQUESTED,
    demo: 'checklist says the venue booking is still pending; Confirm disabled',
  },
  {
    name: '2 Venue on hold',
    day: 9,
    coordinator: 'coordinator',
    booking: BookingStatus.HELD,
    demo: 'a tentative hold is not enough: "on hold"; Confirm disabled',
  },
  {
    name: '3 Projector missing',
    day: 10,
    coordinator: 'coordinator',
    booking: BookingStatus.APPROVED,
    equipment: [{ item: 'projector', needed: 2, reserved: 0 }],
    demo: 'venue OK, "Projector not reserved (0 of 2)"; Confirm disabled',
  },
  {
    name: '4 No equipment needed',
    day: 11,
    coordinator: 'coordinator',
    booking: BookingStatus.APPROVED,
    demo: 'no technical requirements recorded; Confirm enabled',
  },
  {
    name: '5 Ready to confirm',
    day: 12,
    coordinator: 'coordinator',
    booking: BookingStatus.APPROVED,
    equipment: [{ item: 'projector', needed: 2, reserved: 2 }],
    freeText: { type: 'Stage lighting rig', checked: true },
    demo: 'everything ready; Confirm enabled — confirm it, then check as the Organiser',
  },
  {
    name: "6 Fatima's event",
    day: 13,
    coordinator: 'coordinator2',
    booking: BookingStatus.APPROVED,
    equipment: [{ item: 'projector', needed: 2, reserved: 2 }],
    demo: 'assigned to coordinator2@ — coordinator@ gets no Confirm card; coordinator2@ does',
  },
  {
    name: '7 Walk-through',
    day: 14,
    coordinator: 'coordinator',
    booking: BookingStatus.REQUESTED,
    equipment: [
      { item: 'projector', needed: 2, reserved: 0 },
      { item: 'microphone', needed: 4, reserved: 0 },
    ],
    freeText: { type: 'Stage lighting rig', checked: false },
    demo: 'fix live: venue@ approves the booking, tech@ reserves both items, tick the lighting, then Confirm',
  },
];

async function main() {
  const users = Object.fromEntries(
    await Promise.all(
      (['organiser', 'coordinator', 'coordinator2', 'venue'] as const).map(async (key) => [
        key,
        await prisma.user.findUniqueOrThrow({ where: { email: `${key}@connectsphere.local` } }),
      ]),
    ),
  ) as Record<'organiser' | 'coordinator' | 'coordinator2' | 'venue', User>;

  // Clean up the previous run. Events first: they cascade to their bookings,
  // requirements, reservations and notifications, which reference the venue
  // and equipment. Any event booked on the venue or using the equipment goes
  // too, even if renamed since, or it would block deleting them.
  const events = await prisma.eventRequest.deleteMany({
    where: {
      OR: [
        { name: { startsWith: PREFIX } },
        { venueBookings: { some: { venue: { name: { startsWith: PREFIX } } } } },
        { equipmentReservations: { some: { equipment: { type: { startsWith: PREFIX } } } } },
        { equipmentRequirements: { some: { equipment: { type: { startsWith: PREFIX } } } } },
      ],
    },
  });
  const venues = await prisma.venue.deleteMany({ where: { name: { startsWith: PREFIX } } });
  const items = await prisma.equipment.deleteMany({ where: { type: { startsWith: PREFIX } } });
  console.log(`removed previous run: ${events.count} events, ${venues.count} venues, ${items.count} equipment items`);

  const venue = await prisma.venue.create({
    data: {
      name: `${PREFIX} Lecture Theatre`,
      location: 'US-42 demo building',
      capacity: 200,
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

  const equipment: Record<Item, { id: string; type: string }> = {
    projector: await prisma.equipment.create({
      data: {
        type: `${PREFIX} Projector`,
        description: '4K laser projector with HDMI input',
        location: 'AV store, level 1',
        totalQuantity: 6,
      },
    }),
    microphone: await prisma.equipment.create({
      data: {
        type: `${PREFIX} Wireless Microphone`,
        description: 'Handheld wireless microphone',
        location: 'AV store, level 1',
        totalQuantity: 10,
      },
    }),
  };

  const links: string[] = [];

  for (const e of EVENTS) {
    const start = at(e.day, '09:00');
    const end = at(e.day, '12:00');
    const coordinator = users[e.coordinator];

    const event = await prisma.eventRequest.create({
      data: {
        organiserId: users.organiser.id,
        coordinatorId: coordinator.id,
        name: `${PREFIX} ${e.name}`,
        purpose: 'US-42 confirm-arrangements demo',
        description: 'Seeded by prisma/seed-us42.ts.',
        category: 'Demo',
        proposedStart: start,
        proposedEnd: end,
        expectedAttendance: 80,
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
        requestedById: coordinator.id,
        expectedAttendance: 80,
        preferredLayout: RoomLayout.THEATRE,
        // A live hold: expires in 3 days, well before the event.
        ...(e.booking === BookingStatus.HELD
          ? { holdExpiresAt: new Date(Date.now() + 3 * DAY), heldById: users.venue.id }
          : {}),
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

    for (const line of e.equipment ?? []) {
      const item = equipment[line.item];
      await prisma.equipmentRequirement.create({
        data: {
          eventId: event.id,
          equipmentId: item.id,
          equipmentType: item.type,
          quantity: line.needed,
        },
      });
      if (line.reserved > 0) {
        await prisma.equipmentReservation.create({
          data: {
            eventId: event.id,
            equipmentId: item.id,
            quantity: line.reserved,
            start,
            end,
            status: ReservationStatus.APPROVED,
          },
        });
      }
    }

    if (e.freeText) {
      await prisma.equipmentRequirement.create({
        data: {
          eventId: event.id,
          equipmentId: null,
          equipmentType: e.freeText.type,
          quantity: 1,
          ...(e.freeText.checked
            ? { manuallyConfirmedAt: new Date(), manuallyConfirmedById: coordinator.id }
            : {}),
        },
      });
    }

    links.push(
      `${event.name}\n    ${e.demo}\n    coordinator: ${FRONTEND}/coordinator/events/${event.id}\n    organiser:   ${FRONTEND}/organiser/${event.id}`,
    );
  }

  console.log(`\ncreated ${EVENTS.length} events on ${venue.name}:\n\n${links.join('\n\n')}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
