import { Injectable, Logger } from '@nestjs/common';
import { EquipmentStatus, EventStatus, NotificationType, Prisma, Role } from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { EQUIPMENT_STATUS_LABELS } from './equipment-status';

/** The event an equipment notice is about — enough to address and name it. */
export interface NotifiableEvent {
  id: string;
  name: string | null;
  coordinatorId: string | null;
  /**
   * Substitutions Technical Support recorded for this event's reservations of
   * the item, when it is CONFIRMED. Each is named in the notice so the
   * Coordinator sees the proposal where they see the problem.
   */
  substitutions?: SubstitutionLine[];
}

/** One reservation line and what Technical Support proposed for it. */
export interface SubstitutionLine {
  quantity: number;
  /** The item that went out of service. */
  originalType: string;
  /** The proposed replacement's type; null when there is no valid alternative. */
  alternativeType: string | null;
}

/** "2 × "Mic B" instead of "Mic A"" / "no valid alternative for 2 × "Mic A"". */
export function describeSubstitution(line: SubstitutionLine): string {
  return line.alternativeType
    ? `${line.quantity} × "${line.alternativeType}" instead of "${line.originalType}"`
    : `no valid alternative for ${line.quantity} × "${line.originalType}"`;
}

/** What the Coordinator can do next: with no replacement offered, only acknowledge. */
const decideHint = (lines: readonly SubstitutionLine[]) =>
  lines.some((l) => l.alternativeType)
    ? ' Open the event to accept the replacement or decline it and acknowledge the problem.'
    : ' Open the event to acknowledge the problem.';

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
          `Reason: ${item.reason}` +
          this.substitutionSentence(event.substitutions),
      );
    }
  }

  /**
   * Technical Support proposed a substitution after the first notice (the item
   * was already out of service, or the first proposal was voided).
   */
  async substituteSuggested(
    tx: Prisma.TransactionClient,
    event: NotifiableEvent,
    line: SubstitutionLine,
  ): Promise<void> {
    await this.toCoordinator(
      tx,
      event,
      NotificationType.EQUIPMENT_SUBSTITUTE_SUGGESTED,
      `Technical Support has answered the unavailable equipment for your event "${event.name ?? 'an event'}": ` +
        `${describeSubstitution(line)}.${decideHint([line])}`,
    );
  }

  /** The Coordinator decided; tell the Technical Support member(s) concerned. */
  async substituteDecided(
    tx: Prisma.TransactionClient,
    input: {
      recipientIds: readonly string[];
      event: { id: string; name: string | null };
      line: SubstitutionLine;
      accepted: boolean;
      coordinatorName: string;
    },
  ): Promise<void> {
    const outcome = input.accepted
      ? `accepted the replacement (${describeSubstitution(input.line)}); the reservation was moved`
      : `declined the proposal (${describeSubstitution(input.line)}) and acknowledged the equipment problem; the event goes ahead`;
    for (const recipientId of new Set(input.recipientIds)) {
      await this.notifications.notify(
        {
          recipientId,
          type: NotificationType.EQUIPMENT_SUBSTITUTE_DECIDED,
          message: `${input.coordinatorName} ${outcome} for "${input.event.name ?? 'an event'}".`,
          relatedEventId: input.event.id,
        },
        tx,
      );
    }
  }

  private substitutionSentence(lines: readonly SubstitutionLine[] | undefined): string {
    if (!lines || lines.length === 0) return '';
    return ` Technical Support proposes: ${lines.map(describeSubstitution).join('; ')}.${decideHint(lines)}`;
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
