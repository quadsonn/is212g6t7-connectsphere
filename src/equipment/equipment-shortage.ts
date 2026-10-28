import { Prisma, PrismaClient, ReservationStatus } from '@prisma/client';

import { computeShortages, workingQuantity } from './equipment-availability';
import { FINISHED_EVENT_STATUSES } from './equipment-status';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * US-45 — how many units each upcoming committed reservation of these items is
 * short by, from the items' working units as they stand (or as `working`
 * overrides them, to preview a change before it is saved).
 *
 * Derived live on every read, never stored, so a flag appears the moment
 * working units stop covering the reservations and clears the moment they
 * cover them again — after a repair, a reduction or a release. Reservations
 * on finished events never count. Reservations that are not short are absent
 * from the map.
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
      where: {
        equipmentId: { in: ids },
        status: ReservationStatus.APPROVED,
        end: { gt: now },
        event: { status: { notIn: [...FINISHED_EVENT_STATUSES] } },
      },
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

/**
 * US-45 — the latest answer Technical Support gave for a short reservation,
 * as the screens show it. Only one suggestion can be open, and nothing new is
 * recorded while it is, so the latest answer is the open one if any is.
 */
export const LATEST_SUGGESTION_SELECT = {
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  take: 1,
  select: {
    id: true,
    status: true,
    quantity: true,
    reason: true,
    createdAt: true,
    alternativeEquipment: { select: { id: true, type: true } },
  },
} as const satisfies Prisma.EquipmentReservation$suggestionsArgs;

type LatestSuggestionRow = Prisma.EquipmentSuggestionGetPayload<{
  select: (typeof LATEST_SUGGESTION_SELECT)['select'];
}>;

/** An alternative waiting for the Coordinator's decision. */
export interface OpenSuggestion {
  id: string;
  quantity: number;
  reason: string;
  alternativeEquipment: { id: string; type: string };
  createdAt: Date;
}

/** Technical Support's record that no valid alternative exists. */
export interface NoAlternativeNote {
  id: string;
  reason: string;
  createdAt: Date;
}

export function latestAnswer(rows: readonly LatestSuggestionRow[]): {
  openSuggestion: OpenSuggestion | null;
  noAlternative: NoAlternativeNote | null;
} {
  const [latest] = rows;
  if (latest?.status === 'OPEN' && latest.alternativeEquipment && latest.quantity !== null) {
    const { id, quantity, reason, alternativeEquipment, createdAt } = latest;
    return { openSuggestion: { id, quantity, reason, alternativeEquipment, createdAt }, noAlternative: null };
  }
  if (latest?.status === 'NO_ALTERNATIVE') {
    const { id, reason, createdAt } = latest;
    return { openSuggestion: null, noAlternative: { id, reason, createdAt } };
  }
  return { openSuggestion: null, noAlternative: null };
}
