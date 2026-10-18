import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, RegistrationStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  AttendeeChange,
  buildScheduleChangeMessage,
} from './event-schedule-change';
import { NotificationsService } from './notifications.service';

/**
 * Tells an event's registered Attendees that its date, time or venue changed.
 *
 * Lives in the notifications module, depending on nothing above it, so that the
 * events module (an approved change request, a planning edit) and the bookings
 * module (a replacement venue) can both call it — bookings must not import
 * events, which imports bookings.
 *
 * Callers pass the changes as one list and call once per update, so several
 * fields changed together are one notification per Attendee, not one per field.
 * Like every notification it is raised after the change has committed and is
 * best-effort: a failure here is logged and must never undo, or fail, a change
 * the user has successfully made.
 */
@Injectable()
export class AttendeeChangeNotifier {
  private readonly logger = new Logger(AttendeeChangeNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Returns how many Attendees were notified. Only registrations that are
   * currently REGISTERED are told: a withdrawn attendee is no longer coming.
   * No changes, no notification.
   */
  async notifyRegisteredAttendees(
    event: { id: string; name: string | null },
    changes: readonly AttendeeChange[],
  ): Promise<number> {
    if (changes.length === 0) return 0;

    try {
      const registrations = await this.prisma.registration.findMany({
        where: { eventId: event.id, status: RegistrationStatus.REGISTERED },
        select: { attendeeId: true },
      });

      const message = buildScheduleChangeMessage(event.name, changes);

      await Promise.all(
        registrations.map((row) =>
          this.notifications.notifySafely({
            recipientId: row.attendeeId,
            type: NotificationType.EVENT_SCHEDULE_CHANGED,
            message,
            relatedEventId: event.id,
          }),
        ),
      );

      return registrations.length;
    } catch (error) {
      this.logger.error(
        `failed to notify attendees of a change to event ${event.id}`,
        error instanceof Error ? error.stack : String(error),
      );
      return 0;
    }
  }
}
