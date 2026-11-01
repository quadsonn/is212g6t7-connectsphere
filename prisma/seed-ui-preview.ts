/**
 * UI preview data for the Coordinator Lead and Safety Officer list pages, to
 * check how their rows look with realistic, varied content:
 *
 *   lead@    Unassigned queue        4 SUBMITTED requests with no Coordinator —
 *                                    long and short names, organiser with and
 *                                    without an organisation
 *   lead@    Coordinator assignments 3 active events held by coordinator2@ (Fatima)
 *   safety@  Safety checks           3 AWAITING_SAFETY_CHECK events — one plain,
 *                                    one re-check with 2 earlier reviews, one
 *                                    held across two venues
 *
 * The Safety events meet the real readiness rule (every live booking approved,
 * no catalogue equipment outstanding), so the queue's sync keeps them listed.
 *
 * Re-runnable: deletes every event and venue named [UI] (bookings and reviews
 * go with them by cascade), then recreates them. The demo organiser account
 * ui-organiser@ is upserted, not deleted. Refuses to run against a non-local
 * database.
 *
 * Usage: npx ts-node --compiler-options '{"module":"commonjs"}' prisma/seed-ui-preview.ts
 */
import 'dotenv/config';

import {
  AccessibilityFeature,
  BookingStatus,
  EventStatus,
  Facility,
  PrismaClient,
  Role,
  RoomLayout,
  SafetyOutcome,
  SafetyReturnStage,
  VenueStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const PREFIX = '[UI]';

const host = new URL(process.env.DATABASE_URL ?? '').hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`Refusing to seed UI preview data: DATABASE_URL points at "${host}", not a local database.`);
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

const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR);

async function main() {
  const find = (email: string) =>
    prisma.user.findUniqueOrThrow({ where: { email: `${email}@connectsphere.local` } });

  const [organiser, coordinator, coordinator2, venueStaff, safety] = await Promise.all(
    ['organiser', 'coordinator', 'coordinator2', 'venue', 'safety'].map(find),
  );

  // An organiser with an organisation, so the Lead queue shows both forms.
  const uiOrganiser = await prisma.user.upsert({
    where: { email: 'ui-organiser@connectsphere.local' },
    update: {},
    create: {
      email: 'ui-organiser@connectsphere.local',
      name: 'Hannah Organiser',
      role: Role.EVENT_ORGANISER,
      organisation: 'SMU Business Society',
      passwordHash: await bcrypt.hash('12345678', 10),
    },
  });

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

  const base = {
    purpose: 'UI preview data',
    description: 'Seeded by prisma/seed-ui-preview.ts.',
    preferredLayout: RoomLayout.THEATRE,
  };

  // --- Lead: unassigned queue -------------------------------------------------
  const queued = [
    { name: 'Freshmen Orientation Welcome Night', by: uiOrganiser, category: 'Student engagement', attendance: 250, day: 20, submitted: 50 },
    { name: 'Annual Inter-Faculty Case Competition Grand Finals and Networking Reception', by: organiser, category: 'Competition', attendance: 120, day: 24, submitted: 30 },
    { name: 'Book Club', by: organiser, category: 'Club', attendance: 15, day: 22, submitted: 6 },
    { name: 'Sustainability Panel', by: uiOrganiser, category: 'Talk', attendance: 60, day: 27, submitted: 1 },
  ];
  for (const e of queued) {
    await prisma.eventRequest.create({
      data: {
        ...base,
        organiserId: e.by.id,
        coordinatorId: null,
        name: `${PREFIX} ${e.name}`,
        category: e.category,
        proposedStart: at(e.day, '18:00'),
        proposedEnd: at(e.day, '21:00'),
        expectedAttendance: e.attendance,
        status: EventStatus.SUBMITTED,
        submittedAt: hoursAgo(e.submitted),
      },
    });
  }

  // --- Lead: coordinator assignments (held by Fatima) --------------------------
  const held = [
    { name: 'Alumni Homecoming Dinner', status: EventStatus.UNDER_REVIEW, day: 30 },
    { name: 'Cross-Campus Hackathon Weekend with Industry Mentors and Prize Ceremony', status: EventStatus.PLANNING, day: 35 },
    { name: 'Career Fair', status: EventStatus.APPROVED, day: 40 },
  ];
  for (const e of held) {
    await prisma.eventRequest.create({
      data: {
        ...base,
        organiserId: organiser.id,
        coordinatorId: coordinator2.id,
        name: `${PREFIX} ${e.name}`,
        category: 'Demo',
        proposedStart: at(e.day, '10:00'),
        proposedEnd: at(e.day, '16:00'),
        expectedAttendance: 80,
        status: e.status,
        submittedAt: hoursAgo(72),
      },
    });
  }

  // --- Safety: queue ------------------------------------------------------------
  const venueData = {
    location: 'UI preview building',
    facilities: [Facility.POWER_OUTLETS],
    accessibilityFeatures: [AccessibilityFeature.STEP_FREE_ACCESS],
    supportedLayouts: [RoomLayout.THEATRE],
    operatingInfo: 'Every day, 00:00–24:00',
    status: VenueStatus.PUBLISHED,
    setupMinutes: 0,
    turnaroundMinutes: 0,
    managedById: venueStaff.id,
  };
  const hall = await prisma.venue.create({
    data: { ...venueData, name: `${PREFIX} Grand Auditorium`, capacity: 400 },
  });
  const room = await prisma.venue.create({
    data: { ...venueData, name: `${PREFIX} Breakout Room B`, capacity: 40 },
  });

  const safetyEvents = [
    { name: 'Open House Showcase', day: 18, attendance: 300, queued: 40, venues: [hall], reviews: 0 },
    { name: 'Graduation Rehearsal and Photo Session', day: 21, attendance: 350, queued: 20, venues: [hall], reviews: 2 },
    { name: 'Leadership Workshop', day: 25, attendance: 35, queued: 3, venues: [hall, room], reviews: 0 },
  ];
  for (const e of safetyEvents) {
    const start = at(e.day, '09:00');
    const end = at(e.day, '12:00');
    const event = await prisma.eventRequest.create({
      data: {
        ...base,
        organiserId: organiser.id,
        coordinatorId: coordinator.id,
        name: `${PREFIX} ${e.name}`,
        category: 'Demo',
        proposedStart: start,
        proposedEnd: end,
        expectedAttendance: e.attendance,
        status: EventStatus.AWAITING_SAFETY_CHECK,
        submittedAt: hoursAgo(e.queued + 100),
        safetyQueuedAt: hoursAgo(e.queued),
      },
    });

    for (const v of e.venues) {
      await prisma.venueBooking.create({
        data: {
          eventId: event.id,
          venueId: v.id,
          start,
          end,
          status: BookingStatus.APPROVED,
          requestedById: coordinator.id,
          expectedAttendance: e.attendance,
          preferredLayout: RoomLayout.THEATRE,
        },
      });
    }

    // Earlier reviews that asked for changes and were answered by a
    // resubmission, so the event shows as a re-check and is not held.
    for (let i = 0; i < e.reviews; i++) {
      await prisma.safetyReview.create({
        data: {
          eventId: event.id,
          officerId: safety.id,
          outcome: SafetyOutcome.CHANGES_REQUESTED,
          returnStage: SafetyReturnStage.VENUE,
          reason: 'Add a second marked exit route to the layout.',
          createdAt: hoursAgo(e.queued + 48 * (e.reviews - i)),
          resubmittedAt: hoursAgo(e.queued + 1),
        },
      });
    }
  }

  console.log(
    [
      `seeded ${queued.length} unassigned requests, ${held.length} events for Fatima, ${safetyEvents.length} safety-queue events`,
      'log in (password 12345678):',
      '  lead@connectsphere.local    → Unassigned queue, Coordinator assignments',
      '  safety@connectsphere.local  → Safety checks',
    ].join('\n'),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
