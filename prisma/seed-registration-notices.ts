/**
 * Test data for the registration-window notices (opens / closes).
 *
 * Creates two CONFIRMED events, each armed to fire exactly one notice on the
 * next sweep of RegistrationNotificationsScheduler (runs every minute while the
 * API is up):
 *
 *   1. "Opens Test — Brand New Event"
 *      Its "opened" stamp is null, so the sweep sends REGISTRATION_OPENED to
 *      every ATTENDEE who is not registered for it (Sam and Omar below).
 *
 *   2. "Closing Soon — Registration Ending"
 *      Its registration closed yesterday and its "closed" stamp is null, so the
 *      sweep sends REGISTRATION_CLOSED to its registered attendees. Sam is
 *      registered, so Sam receives it. Its "opened" stamp is pre-set so it does
 *      not also fire the opens notice — this event is only about closing.
 *
 * Re-running re-arms both (the stamps are reset), so you get a fresh pair of
 * notices each time.
 *
 * Usage: npm run prisma:seed:notices   (API must be running to see the notices)
 */
import 'dotenv/config';

import {
  AccessibilityFeature,
  BookingStatus,
  EventStatus,
  PrismaClient,
  RegistrationStatus,
  RoomLayout,
  VenueStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const inDays = (days: number, hour = 9) => {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
};

async function main() {
  const organiser = await prisma.user.findUniqueOrThrow({
    where: { email: 'organiser@connectsphere.local' },
  });
  const coordinator = await prisma.user.findUniqueOrThrow({
    where: { email: 'coordinator@connectsphere.local' },
  });
  const sam = await prisma.user.findUniqueOrThrow({
    where: { email: 'attendee@connectsphere.local' },
  });
  const omar = await prisma.user.findUniqueOrThrow({
    where: { email: 'attendee2@connectsphere.local' },
  });

  const now = new Date();

  // Fields the EventRequest_complete_unless_draft CHECK requires on any
  // non-DRAFT event, shared by both.
  const base = {
    organiserId: organiser.id,
    coordinatorId: coordinator.id,
    purpose: 'Demonstrate the registration-window notifications.',
    category: 'Student engagement',
    description: 'A test event used to verify the opens/closes notices fire.',
    preferredLayout: RoomLayout.THEATRE,
    accessibilityRequirements: [AccessibilityFeature.STEP_FREE_ACCESS],
    registrationEnabled: true,
    status: EventStatus.CONFIRMED,
  };

  // 1) OPENS — "opened" stamp null so the next sweep announces it.
  const opensStart = inDays(30);
  const opens = await upsertEvent('Opens Test — Brand New Event', {
    ...base,
    proposedStart: opensStart,
    proposedEnd: new Date(opensStart.getTime() + 8 * 60 * 60 * 1000),
    expectedAttendance: 200,
    registrationOpensAt: inDays(-1), // already open
    registrationClosesAt: inDays(25), // closes later
    // Arm opens; suppress the other two so only the opens notice fires.
    registrationOpenedNotifiedAt: null,
    registrationClosedNotifiedAt: now,
    registrationNearCapacityNotifiedAt: now,
  });

  // 2) CLOSES — registration closed yesterday, "closed" stamp null.
  const closingStart = inDays(10);
  const closing = await upsertEvent('Closing Soon — Registration Ending', {
    ...base,
    proposedStart: closingStart,
    proposedEnd: new Date(closingStart.getTime() + 8 * 60 * 60 * 1000),
    expectedAttendance: 100,
    registrationOpensAt: inDays(-40),
    registrationClosesAt: inDays(-1), // closed yesterday
    // Arm closes; suppress opens (already pre-announced) and near-capacity.
    registrationOpenedNotifiedAt: now,
    registrationClosedNotifiedAt: null,
    registrationNearCapacityNotifiedAt: now,
  });

  // Sam is registered for the closing event, so the "closed" notice reaches someone.
  await register(closing.id, sam.id);

  // 3) NEAR CAPACITY — a venue of 11 seats, 2 registered → 9 left (<= 10).
  const nearStart = inDays(20);
  const near = await upsertEvent('Near Capacity — Few Seats Left', {
    ...base,
    proposedStart: nearStart,
    proposedEnd: new Date(nearStart.getTime() + 8 * 60 * 60 * 1000),
    expectedAttendance: 100, // not the capacity — the venue's 11 is (see below)
    registrationOpensAt: inDays(-30),
    registrationClosesAt: inDays(17),
    // Arm near-capacity; suppress opens (pre-announced) and closes.
    registrationOpenedNotifiedAt: now,
    registrationClosedNotifiedAt: now,
    registrationNearCapacityNotifiedAt: null,
  });

  // A small venue, approved for this event: its 11 seats are the capacity the
  // near-capacity notice measures against.
  let venue = await prisma.venue.findFirst({ where: { name: 'Notices Test Hall' } });
  if (!venue) {
    venue = await prisma.venue.create({
      data: {
        name: 'Notices Test Hall',
        location: 'Test Block, Level 1',
        capacity: 11,
        status: VenueStatus.PUBLISHED,
      },
    });
  }
  const booking = await prisma.venueBooking.findFirst({
    where: { eventId: near.id, venueId: venue.id },
  });
  if (!booking) {
    await prisma.venueBooking.create({
      data: {
        eventId: near.id,
        venueId: venue.id,
        start: nearStart,
        end: new Date(nearStart.getTime() + 8 * 60 * 60 * 1000),
        status: BookingStatus.APPROVED,
      },
    });
  }

  // Two of the 11 seats taken → 9 left, so the next sweep notifies them both.
  await register(near.id, sam.id);
  await register(near.id, omar.id);

  console.log('Seeded registration-window test events:');
  console.log(`  OPENS         → ${opens.id}  "${opens.name}"  (every unregistered attendee)`);
  console.log(`  CLOSES        → ${closing.id}  "${closing.name}"  (Sam, who is registered)`);
  console.log(`  NEAR CAPACITY → ${near.id}  "${near.name}"  (Sam & Omar; 9 of 11 seats left)`);
  console.log('\nFire them now with:  npm run notices:trigger');
  console.log('…or wait ~1 minute (API running), then sign in as an attendee and check');
  console.log('the notifications bell / page.');
}

/** Register an attendee for an event (or re-activate a withdrawn registration). */
async function register(eventId: string, attendeeId: string) {
  await prisma.registration.upsert({
    where: { eventId_attendeeId: { eventId, attendeeId } },
    update: { status: RegistrationStatus.REGISTERED, withdrawnAt: null },
    create: {
      eventId,
      attendeeId,
      status: RegistrationStatus.REGISTERED,
      phone: '+65 9000 0000',
    },
  });
}

/** Create the named event, or update it and re-arm its notice stamps. */
async function upsertEvent(name: string, data: Record<string, unknown>) {
  const existing = await prisma.eventRequest.findFirst({ where: { name } });
  if (existing) {
    return prisma.eventRequest.update({ where: { id: existing.id }, data });
  }
  return prisma.eventRequest.create({ data: { name, ...data } as never });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
