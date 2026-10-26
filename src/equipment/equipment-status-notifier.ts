import { Injectable } from '@nestjs/common';
import { EquipmentStatus, NotificationType, Prisma, Role } from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { isLendable } from './equipment-availability';
import { EQUIPMENT_STATUS_LABELS } from './equipment-status';

/**
 * Every Technical Support member, optionally leaving one out. The pool that
 * inventory-wide notices go to (US-60), and US-66's "nobody is assigned yet"
 * recipients. The schema has no deactivation flag, so every account with the
 * role counts, as for the Lead's Coordinator list.
 */
export async function technicalSupportStaffIds(
  client: Prisma.TransactionClient | PrismaService,
  exceptId: string | null = null,
): Promise<string[]> {
  const staff = await client.user.findMany({
    where: {
      role: Role.TECHNICAL_SUPPORT_STAFF,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return staff.map((s) => s.id);
}

/** What US-45's changeStatus() recorded, as the notice needs it. */
export interface RecordedStatusChange {
  equipmentId: string;
  toStatus: EquipmentStatus;
  reason: string;
  /** The Technical Support member who made the change. */
  actorId: string;
}

/**
 * US-60 — Technical Support are alerted when a colleague takes an item out of
 * use, so they know the shared inventory changed before they try to reserve it.
 *
 * AC-1: every Technical Support member except the one who made the change,
 * with the item's name and its new status (and the reason given, US-45 AC-2).
 * AC-2: never the actor. AC-3: inventory-wide — nothing here reads events or
 * assignments, so it fires whether or not anyone is assigned to anything.
 *
 * Only Damaged and Under Maintenance are announced; an item returning to
 * Available frees units rather than withdrawing them. Coordinators whose
 * events are affected are US-67's, not this story's.
 *
 * Called after the status change has committed, best-effort, like US-31's
 * notice: a notice that cannot be recorded must not undo the change.
 */
@Injectable()
export class EquipmentStatusNotifier {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async statusChanged(change: RecordedStatusChange): Promise<number> {
    if (isLendable(change.toStatus)) return 0;

    const [item, actor, recipients] = await Promise.all([
      this.prisma.equipment.findUnique({ where: { id: change.equipmentId }, select: { type: true } }),
      this.prisma.user.findUnique({ where: { id: change.actorId }, select: { name: true } }),
      technicalSupportStaffIds(this.prisma, change.actorId),
    ]);
    if (!item) return 0;

    const message =
      `${item.type} marked ${EQUIPMENT_STATUS_LABELS[change.toStatus]}` +
      ` by ${actor?.name ?? 'a colleague'}. Reason: ${change.reason}`;

    await Promise.all(
      recipients.map((recipientId) =>
        this.notifications.notifySafely({
          recipientId,
          type: NotificationType.EQUIPMENT_STATUS_CHANGED,
          message,
          relatedEquipmentId: change.equipmentId,
        }),
      ),
    );

    return recipients.length;
  }
}
