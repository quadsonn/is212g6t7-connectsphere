import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, Role } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { userIdsWithRole } from '../users/user-ids-with-role';
import { NotificationsService } from './notifications.service';

/**
 * The venues are in Singapore, so the date is the one on the wall there — the
 * same zone the attendee schedule-change notices use (event-schedule-change.ts).
 */
const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Singapore',
});

/**
 * US-64 — alerts every Safety Officer that an event has entered
 * AWAITING_SAFETY_CHECK, so they can review it rather than find it by polling
 * the queue.
 *
 * There are two ways in, and both call this after their transaction commits:
 * the Coordinator confirming the arrangements (US-42,
 * EventConfirmationService.confirm) and sending the event back after a review
 * (SafetyService.resubmit). No scheduled job: several backend instances share
 * one database, and a job in each would alert everyone more than once.
 *
 * The Safety Officer role has no assignment to an event: any of them may pick
 * it up, so all of them are told. Recipients are read when sending.
 *
 * Lives in the notifications module, depending on nothing above it, because
 * the safety module imports the events module and one caller is in each.
 * Best-effort, like every notification: a failure is logged and must never
 * undo, or fail, the status change that triggered it.
 */
@Injectable()
export class SafetyCheckNotifier {
  private readonly logger = new Logger(SafetyCheckNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** AC1/AC2. Returns how many Safety Officers were notified. */
  async notifyCheckDue(event: {
    id: string;
    name: string | null;
    proposedStart: Date | null;
  }): Promise<number> {
    try {
      const officerIds = await userIdsWithRole(this.prisma, Role.SAFETY_OFFICER);
      const message = checkDueMessage(event);

      await Promise.all(
        officerIds.map((recipientId) =>
          this.notifications.notifySafely({
            recipientId,
            type: NotificationType.SAFETY_CHECK_DUE,
            message,
            relatedEventId: event.id,
          }),
        ),
      );

      return officerIds.length;
    } catch (error) {
      this.logger.error(
        `failed to alert Safety Officers about event ${event.id}`,
        error instanceof Error ? error.stack : String(error),
      );
      return 0;
    }
  }
}

/**
 * AC2: "Safety check due: <name> on <date>". An event in the Safety queue has
 * passed submission, so it always has a start (EventRequest_complete_unless_draft);
 * the type allows null, and then the date is left out rather than invented.
 */
function checkDueMessage(event: { name: string | null; proposedStart: Date | null }): string {
  const name = event.name ?? 'Untitled event';
  return event.proposedStart
    ? `Safety check due: ${name} on ${dateFormat.format(event.proposedStart)}`
    : `Safety check due: ${name}`;
}
