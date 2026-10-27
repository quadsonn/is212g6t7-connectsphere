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
   * AC-1 — units of an item were marked damaged or under maintenance and the
   * remaining units no longer cover a committed reservation; notify the
   * Coordinator of each such event, once per event. US-45: the notice names how
   * many units were marked and how many the event is now short by. `events` is
   * already filtered to the reservations the change made short.
   */
  async unavailable(
    tx: Prisma.TransactionClient,
    item: {
      type: string;
      status: EquipmentStatus;
      reason: string;
      /** US-45: units marked, of how many. */
      quantity?: number;
      totalQuantity?: number;
    },
    events: (NotifiableEvent & { shortBy?: number })[],
  ): Promise<void> {
    const label = EQUIPMENT_STATUS_LABELS[item.status].toLowerCase();
    const worst = new Map<string, NotifiableEvent & { shortBy?: number }>();
    for (const event of events) {
      // One notice per event, naming its largest shortfall.
      if ((worst.get(event.id)?.shortBy ?? -1) < (event.shortBy ?? 0)) worst.set(event.id, event);
    }
    const marked =
      item.quantity !== undefined && item.totalQuantity !== undefined
        ? `${item.quantity} of ${item.totalQuantity} "${item.type}" are now ${label}`
        : `Equipment "${item.type}" is now ${label}`;
    for (const event of worst.values()) {
      const short = event.shortBy ? ` and is short by ${event.shortBy}` : '';
      await this.toCoordinator(
        tx,
        event,
        NotificationType.EQUIPMENT_UNAVAILABLE,
        // " Reason: " so the notifications page shows the reason apart.
        `${marked}: the reservation for your event "${event.name ?? 'an event'}" is affected${short}. ` +
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
  /**
   * US-45 — Technical Support reduced or released a reservation of this event
   * to resolve a shortage; the message carries what changed and the reason.
   */
  async reservationAdjusted(
    tx: Prisma.TransactionClient,
    event: NotifiableEvent,
    message: string,
  ): Promise<void> {
    await this.toCoordinator(tx, event, NotificationType.EQUIPMENT_RESERVATION_ADJUSTED, message);
  }

  /** US-45 — an alternative item was suggested for a short reservation. */
  async alternativeSuggested(
    tx: Prisma.TransactionClient,
    event: NotifiableEvent,
    message: string,
  ): Promise<void> {
    await this.toCoordinator(tx, event, NotificationType.EQUIPMENT_ALTERNATIVE_SUGGESTED, message);
  }

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
