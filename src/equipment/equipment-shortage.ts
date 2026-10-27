import { Prisma, PrismaClient, ReservationStatus } from '@prisma/client';

import { computeShortages, workingQuantity } from './equipment-availability';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * US-45 — how many units each upcoming committed reservation of these items is
 * short by, from the items' working units as they stand (or as `working`
 * overrides them, to preview a change before it is saved).
 *
 * Derived live on every read, never stored, so a flag appears the moment
 * working units stop covering the reservations and clears the moment they
 * cover them again — after a repair, a reduction or a release. Reservations
 * that are not short are absent from the map.
 */
export async function loadShortages(
  db: Db,
  equipmentIds: readonly string[],
  now: Date = new Date(),
  working?: ReadonlyMap<string, number>,
): Promise<Map<string, number>> {
  const ids = [...new Set(equipmentIds)];
  if (ids.length === 0) return new Map();

  const [items, reservations] = await Promise.all([
    db.equipment.findMany({
      where: { id: { in: ids } },
      select: { id: true, totalQuantity: true, damagedQuantity: true, maintenanceQuantity: true },
    }),
    db.equipmentReservation.findMany({
      where: { equipmentId: { in: ids }, status: ReservationStatus.APPROVED, end: { gt: now } },
      select: { id: true, equipmentId: true, quantity: true, start: true, end: true },
    }),
  ]);

  const shortBy = new Map<string, number>();
  for (const item of items) {
    const units = working?.get(item.id) ?? workingQuantity(item);
    const own = reservations.filter((r) => r.equipmentId === item.id);
    for (const [id, short] of computeShortages(units, own, now)) shortBy.set(id, short);
  }
  return shortBy;
}
