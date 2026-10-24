/**
 * Test data for "events at ANY status have no flag when equipment they need
 * becomes unavailable".
 *
 * Creates one shared item and several events across the statuses an event can
 * hold while it has a committed (APPROVED) equipment reservation — PLANNING,
 * AWAITING_ARRANGEMENTS, AWAITING_SAFETY_CHECK, CONFIRMED and COMPLETED — each
 * with an upcoming APPROVED reservation of that one item.
 *
 * Then, as Technical Support, mark the item Damaged / Under maintenance and
 * re-run `npm run check:equip-unavailable`: the item's operationalStatus is the
 * ONLY thing that changes. Every event — whatever its status — keeps its
 * status, and every reservation stays APPROVED with no unavailability flag,
 * because no such flag exists on the event or the reservation.
 *
 * Usage: npm run prisma:seed:equip-unavailable
 */
import 'dotenv/config';

import {
  AccessibilityFeature,
  EquipmentStatus,
  EventStatus,
  PrismaClient,
  ReservationStatus,
  RoomLayout,
} from '@prisma/client';

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const ITEM_TYPE = 'Shared Projector (unavailability demo)';

// One event per status, so the "no flag, whatever the status" claim is visible
// across the whole live lifecycle.
const SCENARIOS: { name: string; status: EventStatus }[] = [
  { name: 'Equip Demo — Planning', status: EventStatus.PLANNING },
  { name: 'Equip Demo — Awaiting Arrangements', status: EventStatus.AWAITING_ARRANGEMENTS },
  { name: 'Equip Demo — Awaiting Safety Check', status: EventStatus.AWAITING_SAFETY_CHECK },
  { name: 'Equip Demo — Confirmed', status: EventStatus.CONFIRMED },
  { name: 'Equip Demo — Completed', status: EventStatus.COMPLETED },
];

async function main() {
  const organiser = await prisma.user.findUniqueOrThrow({
    where: { email: 'organiser@connectsphere.local' },
  });
  const coordinator = await prisma.user.findUniqueOrThrow({
    where: { email: 'coordinator@connectsphere.local' },
  });

  const start = new Date(Date.now() + 15 * DAY);
  start.setUTCHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + 6 * 60 * 60 * 1000);

  // A shared item with room for every reservation, reset to OPERATIONAL so the
  // test can be re-run.
  let item = await prisma.equipment.findFirst({ where: { type: ITEM_TYPE } });
  if (item) {
    item = await prisma.equipment.update({
      where: { id: item.id },
      data: { operationalStatus: EquipmentStatus.OPERATIONAL },
    });
  } else {
    item = await prisma.equipment.create({
      data: { type: ITEM_TYPE, totalQuantity: 20, operationalStatus: EquipmentStatus.OPERATIONAL },
    });
  }

  for (const scenario of SCENARIOS) {
    const data = {
      organiserId: organiser.id,
      coordinatorId: coordinator.id,
      purpose: 'Show that no event status gains an equipment-unavailable flag.',
      category: 'Student engagement',
      description: 'Shares the demo projector; we will take that item out of service.',
      preferredLayout: RoomLayout.THEATRE,
      accessibilityRequirements: [AccessibilityFeature.STEP_FREE_ACCESS],
      expectedAttendance: 120,
      registrationEnabled: true,
      status: scenario.status,
      proposedStart: start,
      proposedEnd: end,
    };

    let event = await prisma.eventRequest.findFirst({ where: { name: scenario.name } });
    event = event
      ? await prisma.eventRequest.update({ where: { id: event.id }, data })
      : await prisma.eventRequest.create({ data: { name: scenario.name, ...data } });

    // An APPROVED (committed), upcoming reservation of the shared item.
    const reservation = await prisma.equipmentReservation.findFirst({
      where: { eventId: event.id, equipmentId: item.id },
    });
    if (reservation) {
      await prisma.equipmentReservation.update({
        where: { id: reservation.id },
        data: { status: ReservationStatus.APPROVED, start, end, releasedAt: null },
      });
    } else {
      await prisma.equipmentReservation.create({
        data: {
          eventId: event.id,
          equipmentId: item.id,
          quantity: 1,
          start,
          end,
          status: ReservationStatus.APPROVED,
        },
      });
    }

    console.log(`  ${scenario.status.padEnd(22)} ${event.id}  "${event.name}"`);
  }

  console.log(`\nItem: ${item.id}  "${item.type}"  (OPERATIONAL)`);
  console.log('Each event above has an APPROVED reservation of it.');
  console.log('\nNext: run  npm run check:equip-unavailable  for the baseline, then sign in as');
  console.log('tech@connectsphere.local, mark the item Damaged / Under maintenance, and run');
  console.log('the check again — only the item changes; no event or reservation gets a flag.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
