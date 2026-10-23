import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, Role } from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * US — notify the people who pick up incoming work, so they don't poll queues:
 *
 *   submitted       -> every Coordinator Lead, when a request is submitted or
 *                      resubmitted (EVENT_SUBMITTED).
 *   changeRequested -> the event's assigned Coordinator, or — when none is
 *                      assigned — every Coordinator Lead, using the same
 *                      fallback as the hold notifier (EVENT_CHANGE_REQUESTED,
 *                      the type defined long ago but never sent until now).
 *
 * Best-effort, after the triggering write has committed: a notification that
 * cannot be recorded must not undo the submission the Organiser performed
 * (matching NotificationsService.notifySafely). Each notice carries the event,
 * so the recipient links straight to it.
 */
@Injectable()
export class EventsRequestNotifier {
  private readonly logger = new Logger(EventsRequestNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** AC-1 — a new or resubmitted request; tell every Coordinator Lead. */
  async submitted(event: { id: string; name: string | null }): Promise<void> {
    await this.send(
      await this.leadIds(),
      NotificationType.EVENT_SUBMITTED,
      `A new event request "${event.name ?? 'Untitled event'}" has been submitted and needs a Coordinator.`,
      event.id,
    );
  }

  /** AC-2 — a change request; tell the assigned Coordinator, else the Leads. */
  async changeRequested(event: {
    id: string;
    name: string | null;
    coordinatorId: string | null;
  }): Promise<void> {
    const recipients = event.coordinatorId ? [event.coordinatorId] : await this.leadIds();
    await this.send(
      recipients,
      NotificationType.EVENT_CHANGE_REQUESTED,
      `A change has been requested for "${event.name ?? 'an event'}".`,
      event.id,
    );
  }

  private async leadIds(): Promise<string[]> {
    const leads = await this.prisma.user.findMany({
      where: { role: Role.EVENT_COORDINATOR_LEAD },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return leads.map((lead) => lead.id);
  }

  /** Record one notice per recipient; a recording failure is logged, not thrown. */
  private async send(
    recipientIds: string[],
    type: NotificationType,
    message: string,
    eventId: string,
  ): Promise<void> {
    if (recipientIds.length === 0) {
      this.logger.warn(`${type} for event ${eventId} not sent: no recipient found`);
      return;
    }
    try {
      await this.notifications.notifyMany(
        recipientIds.map((recipientId) => ({
          recipientId,
          type,
          message,
          relatedEventId: eventId,
        })),
      );
    } catch (error) {
      this.logger.error(`failed to record ${type} for event ${eventId}`, error as Error);
    }
  }
}
