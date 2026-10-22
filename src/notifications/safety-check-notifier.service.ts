import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, Role } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

/**
 * Short, like the other titled notices: the inbox titles it "Safety check
 * requested" and shows the event beside it.
 */
export const SAFETY_CHECK_REQUESTED_MESSAGE = 'Arrangements confirmed. Ready for a safety check.';
export const SAFETY_CHECK_RESUBMITTED_MESSAGE =
  'Sent back by the Coordinator after changes. Ready for a safety check.';

/**
 * US-64 — tells every Safety Officer that an event entered
 * AWAITING_SAFETY_CHECK.
 *
 * There are two ways in, and both call this: the Coordinator confirming the
 * arrangements (US-42, EventConfirmationService.confirm) and sending the event
 * back after a review asked for changes or rejected it
 * (SafetyService.resubmit). The resubmission message says so.
 *
 * The Safety Officer role has no assignment to an event: any of them may pick
 * it up from the queue, so all of them are told. Recipients are read when
 * sending, so an officer added later is not told about events already queued.
 *
 * Lives in the notifications module, depending on nothing above it, because
 * the safety module imports the events module and one of the callers is in
 * each. Raised after the status change has committed and best-effort: a
 * failure here is logged and must never undo, or fail, the confirmation.
 */
@Injectable()
export class SafetyOfficerNotifier {
  private readonly logger = new Logger(SafetyOfficerNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Returns how many Safety Officers were notified. */
  async notifySafetyCheckDue(
    event: { id: string },
    options: { resubmitted: boolean },
  ): Promise<number> {
    try {
      const officers = await this.prisma.user.findMany({
        where: { role: Role.SAFETY_OFFICER },
        select: { id: true },
      });

      const message = options.resubmitted
        ? SAFETY_CHECK_RESUBMITTED_MESSAGE
        : SAFETY_CHECK_REQUESTED_MESSAGE;

      await Promise.all(
        officers.map((officer) =>
          this.notifications.notifySafely({
            recipientId: officer.id,
            type: NotificationType.SAFETY_CHECK_REQUESTED,
            message,
            relatedEventId: event.id,
          }),
        ),
      );

      return officers.length;
    } catch (error) {
      this.logger.error(
        `failed to notify Safety Officers about event ${event.id}`,
        error instanceof Error ? error.stack : String(error),
      );
      return 0;
    }
  }
}
