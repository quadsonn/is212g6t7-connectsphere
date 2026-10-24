import { Facility, Prisma } from '@prisma/client';

import { inEntryOrder } from '../prisma/readable-id';

/**
 * Story 20 AC-2 — the event's technical requirements, copied onto a venue
 * booking request (or hold) when it is made, so Venue Staff see them without
 * opening the event. A snapshot like US-21's other requirements: later edits
 * to the event do not change a request already made.
 */

/** One equipment line (US-28) as the request records it. */
export interface EquipmentLineSnapshot {
  equipmentType: string;
  quantity: number;
  notes: string | null;
}

export interface TechnicalSnapshot {
  requiredFacilities: Facility[];
  equipmentRequirements: EquipmentLineSnapshot[];
  technicalSupportNeeds: string | null;
}

/** The event's technical requirements now, lines in the order they were entered. */
export async function technicalSnapshotOf(
  db: Prisma.TransactionClient,
  event: { id: string; requiredFacilities: Facility[]; technicalSupportNeeds: string | null },
): Promise<TechnicalSnapshot> {
  const lines = inEntryOrder(
    await db.equipmentRequirement.findMany({
      where: { eventId: event.id },
      select: { id: true, createdAt: true, equipmentType: true, quantity: true, notes: true },
    }),
  );

  return {
    requiredFacilities: event.requiredFacilities,
    equipmentRequirements: lines.map(({ equipmentType, quantity, notes }) => ({
      equipmentType,
      quantity,
      notes,
    })),
    technicalSupportNeeds: event.technicalSupportNeeds,
  };
}

/** The snapshot as booking create data. */
export function technicalSnapshotData(snapshot: TechnicalSnapshot) {
  return {
    requiredFacilities: snapshot.requiredFacilities,
    equipmentRequirements: snapshot.equipmentRequirements as unknown as Prisma.InputJsonValue,
    technicalSupportNeeds: snapshot.technicalSupportNeeds,
  };
}

/**
 * US-48: a rebooked request carries its original's copy unchanged — what
 * Venue Staff approved. A request made before the copy existed stays
 * "not recorded" (database NULL).
 */
export function carriedTechnicalSnapshot(booking: {
  requiredFacilities: Facility[];
  equipmentRequirements: Prisma.JsonValue | null;
  technicalSupportNeeds: string | null;
}) {
  return {
    requiredFacilities: booking.requiredFacilities,
    equipmentRequirements:
      booking.equipmentRequirements === null
        ? Prisma.DbNull
        : (booking.equipmentRequirements as Prisma.InputJsonValue),
    technicalSupportNeeds: booking.technicalSupportNeeds,
  };
}
