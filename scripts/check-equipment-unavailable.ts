/**
 * Prints the state that matters for "do events at any status get flagged when
 * equipment they need goes unavailable?". Run it before and after marking the
 * shared demo item Damaged / Under maintenance — the ONLY field that changes is
 * the item's operationalStatus. Every event keeps its status, and every
 * reservation stays APPROVED with no unavailability flag.
 *
 * Usage: npm run check:equip-unavailable
 */
import 'dotenv/config';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ITEM_TYPE = 'Shared Projector (unavailability demo)';

async function main() {
  const item = await prisma.equipment.findFirst({
    where: { type: ITEM_TYPE },
    select: { id: true, type: true, operationalStatus: true },
  });

  if (!item) {
    console.log(`No "${ITEM_TYPE}" found. Run: npm run prisma:seed:equip-unavailable`);
    await prisma.$disconnect();
    return;
  }

  const reservations = await prisma.equipmentReservation.findMany({
    where: { equipmentId: item.id },
    select: {
      id: true,
      status: true,
      releasedAt: true,
      replacedById: true,
      event: { select: { name: true, status: true } },
    },
    orderBy: { id: 'asc' },
  });

  console.log(`ITEM  ${item.id}  "${item.type}"  →  operationalStatus: ${item.operationalStatus}\n`);
  console.log('Events needing this item (note: no flag column exists to show):');
  for (const r of reservations) {
    console.log(
      `  [${(r.event.status ?? '').padEnd(22)}] ${(r.event.name ?? '').padEnd(40)} ` +
        `reservation=${r.status}  releasedAt=${r.releasedAt ? 'set' : 'null'}  ` +
        `replacedById=${r.replacedById ?? 'null'}`,
    );
  }
  console.log(
    '\nNo event status changes, and every reservation stays APPROVED with no',
  );
  console.log('"unavailable" flag — only the ITEM line above moves out of OPERATIONAL.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
