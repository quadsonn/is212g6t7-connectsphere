import { Injectable, Logger } from '@nestjs/common';
import { EquipmentStatus, EventStatus, NotificationType, Prisma, Role } from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { EQUIPMENT_STATUS_LABELS } from './equipment-status';

/** The event an equipment notice is about — enough to address and name it. */
export interface NotifiableEvent {
  id: string;
  name: string | null;
  coordinatorId: string | null;
}

/**
 * US — tell the Event Coordinator when equipment their event depends on
 * becomes unavailable or is released, so they can react without polling.
 *
 *   unavailable -> an item taken out of service; one notice per affected event
 *   released    -> a committed reservation given back on cancel/unfulfillable
 *
 * Recipient resolution mirrors the hold notifier (HoldNotifier.toCoordinators):
 * the event's assigned Coordinator, or — when none is assigned — every
 * Coordinator Lead; if there are none, the notice is skipped and logged.
 *
 * Everything is recorded with notify(input, tx) inside the caller's
 * transaction, so a notice exists if and only if the change that caused it did.
 */
@Injectable()
export class EquipmentNotifier {
  private readonly logger = new Logger(EquipmentNotifier.name);

  constructor(private readonly notifications: NotificationsService) {}

  /**
   * AC-1 — an item was marked damaged or under maintenance; notify the
   * Coordinator of each event that has a committed (APPROVED) reservation of
   * it, once per event. `events` is already filtered to the committed ones.
   */
  async unavailable(
    tx: Prisma.TransactionClient,
    item: { type: string; status: EquipmentStatus; reason: string },
    events: NotifiableEvent[],
  ): Promise<void> {
    const label = EQUIPMENT_STATUS_LABELS[item.status].toLowerCase();
    const seen = new Set<string>();
    for (const event of events) {
      if (seen.has(event.id)) continue; // one notice per event
      seen.add(event.id);
      await this.toCoordinator(
        tx,
        event,
        NotificationType.EQUIPMENT_UNAVAILABLE,
        // " Reason: " so the notifications page shows the reason apart.
        `Equipment "${item.type}" reserved for your event "${event.name ?? 'an event'}" is now ${label}. ` +
          `Reason: ${item.reason}`,
      );
    }
  }

  /**
   * AC-2 — a committed reservation was released because the event was cancelled
   * or rejected as unfulfillable; notify the event's Coordinator.
   */
  async released(
    tx: Prisma.TransactionClient,
    event: NotifiableEvent & { status: EventStatus },
  ): Promise<void> {
    const why =
      event.status === EventStatus.REJECTED
        ? 'the request was rejected as unfulfillable'
        : 'the event was cancelled';
    await this.toCoordinator(
      tx,
      event,
      NotificationType.EQUIPMENT_RELEASED,
      `The equipment reserved for your event "${event.name ?? 'an event'}" has been released because ${why}.`,
    );
  }

  /** The event's Coordinator, or every Lead if unassigned; skip + log if none. */
  private async toCoordinator(
    tx: Prisma.TransactionClient,
    event: NotifiableEvent,
    type: NotificationType,
    message: string,
  ): Promise<void> {
    const recipients = event.coordinatorId
      ? [event.coordinatorId]
      : (
          await tx.user.findMany({
            where: { role: Role.EVENT_COORDINATOR_LEAD },
            select: { id: true },
            orderBy: { id: 'asc' },
          })
        ).map((u) => u.id);

    if (recipients.length === 0) {
      this.logger.warn(
        `${type} for event ${event.id} not sent: it has no Coordinator and there is no Coordinator Lead`,
      );
      return;
    }

    for (const recipientId of recipients) {
      await this.notifications.notify({ recipientId, type, message, relatedEventId: event.id }, tx);
    }
  }
}
