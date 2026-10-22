import { ConflictException, Injectable } from '@nestjs/common';
import {
  ChangeRequestStatus,
  EventRequest,
  EventStatus,
  NotificationType,
  Prisma,
  RegistrationStatus,
} from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AccessControlService } from '../common/access/access-control.service';
import { Action } from '../common/access/permission.types';
import { BookingsService } from '../bookings/bookings.service';
import { EquipmentReservationsService } from '../equipment/equipment-reservations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CancelEventDto } from './dto/cancel-event.dto';
import { evaluateCancellation } from './event-cancellation.rules';
import { FieldChange } from './event-change.rules';
import { EventsService } from './events.service';

/** What the Organiser gets back, so the client can confirm what was released. */
export interface CancellationResult {
  event: EventRequest;
  released: { venueBookings: number; equipmentReservations: number };
  closedChangeRequests: number;
  /** AC-8 recipients: the Coordinator and Attendees, not the Organiser's own confirmation. */
  notified: number;
}

/**
 * US-43 — an Organiser cancels their own event.
 *
 * One transaction does everything the card says must happen "in the same
 * request": the status change (through EventsService.setStatus(), which also
 * releases the equipment and the venue bookings), closing the pending change
 * request, and the history entry. Notifications go out after it commits and are
 * best-effort, like every other notification: a failure to record one must not
 * undo a cancellation the Organiser has successfully made.
 */
@Injectable()
export class EventsCancellationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
    private readonly events: EventsService,
    private readonly bookings: BookingsService,
    private readonly reservations: EquipmentReservationsService,
    private readonly notifications: NotificationsService,
  ) {}

  async cancel(
    user: AuthenticatedUser,
    eventId: string,
    dto: CancelEventDto,
  ): Promise<CancellationResult> {
    // AC-1 "only my own events": someone else's event is reported as not found.
    await this.access.assertEventAccess(user, eventId, Action.CANCEL);

    const outcome = await this.prisma.$transaction(async (tx) => {
      // Registration locks the same row, so a registration racing a
      // cancellation either lands first (and is notified below) or sees the
      // event cancelled and is refused.
      await tx.$queryRaw`
        SELECT "id" FROM "EventRequest" WHERE "id" = ${eventId} FOR UPDATE`;

      // Re-read under the lock: the status may have changed while waiting.
      const event = await tx.eventRequest.findUniqueOrThrow({
        where: { id: eventId },
      });

      const check = evaluateCancellation(event, new Date());
      if (!check.canCancel) {
        throw new ConflictException(check.reason);
      }

      // Counted first: setStatus() below releases them and returns no count.
      const equipmentReservations = await this.reservations.countReleasable(
        eventId,
        tx,
      );
      const venueBookings = await this.bookings.countReleasableForEvent(
        eventId,
        tx,
      );

      // Releases the equipment (US-33) and the venue bookings (US-44: each
      // RELEASED with reason "Event cancelled", a history row naming this
      // Organiser, and a notice to its venue's manager) in this transaction.
      const cancelled = await this.events.setStatus(
        event,
        EventStatus.CANCELLED,
        tx,
        user.userId,
      );
      const closedChangeRequests = await this.closePendingChangeRequests(
        tx,
        eventId,
        user,
      );

      // AC-3: the reason, who and when, in the same history the planning
      // edits use. EventChange carries the actor and the timestamp.
      await this.events.recordChange(
        tx,
        eventId,
        user.userId,
        this.historyEntry(event.status, dto.reason),
        [],
      );

      return {
        event: cancelled,
        venueBookings,
        equipmentReservations,
        closedChangeRequests,
      };
    });

    const notified = await this.notifyCancelled(outcome.event, dto.reason);
    await this.confirmToOrganiser(outcome, dto.reason);

    return {
      event: outcome.event,
      released: {
        venueBookings: outcome.venueBookings,
        equipmentReservations: outcome.equipmentReservations,
      },
      closedChangeRequests: outcome.closedChangeRequests,
      notified,
    };
  }

  private historyEntry(previous: EventStatus, reason: string): FieldChange[] {
    return [
      { field: 'status', previous, next: EventStatus.CANCELLED },
      { field: 'cancellationReason', previous: null, next: reason },
    ];
  }

  /**
   * AC-7 "any pending change request is closed". CLOSED, not REJECTED: nobody
   * decided it, so it must not read as a Coordinator's refusal. The decision
   * columns are still filled (the schema requires a time on every non-pending
   * request) with the Organiser who cancelled as the one who closed it.
   */
  private async closePendingChangeRequests(
    tx: Prisma.TransactionClient,
    eventId: string,
    user: AuthenticatedUser,
  ): Promise<number> {
    const result = await tx.eventChangeRequest.updateMany({
      where: { eventId, status: ChangeRequestStatus.PENDING },
      data: {
        status: ChangeRequestStatus.CLOSED,
        decidedById: user.userId,
        decidedAt: new Date(),
        decisionReason: 'The event was cancelled.',
      },
    });

    return result.count;
  }

  /**
   * AC-8 — the assigned Coordinator and every registered Attendee. Withdrawn
   * attendees are not told: they are no longer part of the event.
   */
  private async notifyCancelled(
    event: EventRequest,
    reason: string,
  ): Promise<number> {
    const registrations = await this.prisma.registration.findMany({
      where: { eventId: event.id, status: RegistrationStatus.REGISTERED },
      select: { attendeeId: true },
    });

    const recipients = new Set<string>(
      registrations.map((row) => row.attendeeId),
    );
    if (event.coordinatorId) {
      recipients.add(event.coordinatorId);
    }

    const name = event.name ?? 'An event';
    const message = `${name} has been cancelled. Reason: ${reason}`;

    await Promise.all(
      [...recipients].map((recipientId) =>
        this.notifications.notifySafely({
          recipientId,
          type: NotificationType.EVENT_CANCELLED,
          message,
          relatedEventId: event.id,
        }),
      ),
    );

    return recipients.size;
  }

  /**
   * US-65 — the Organiser who cancelled gets their own record of it: what was
   * released and the reason they gave. Worded for them, so it is a separate
   * notification from the one the Coordinator and Attendees get.
   */
  private async confirmToOrganiser(
    outcome: {
      event: EventRequest;
      venueBookings: number;
      equipmentReservations: number;
      closedChangeRequests: number;
    },
    reason: string,
  ): Promise<void> {
    const { event } = outcome;
    const released =
      outcome.venueBookings + outcome.equipmentReservations > 0
        ? ` ${countOf(outcome.venueBookings, 'venue booking')} and ${countOf(outcome.equipmentReservations, 'equipment reservation')} were released.`
        : ' It held no venue bookings or equipment.';
    const closed =
      outcome.closedChangeRequests > 0 ? ' Your pending change request was closed.' : '';

    await this.notifications.notifySafely({
      recipientId: event.organiserId,
      type: NotificationType.EVENT_CANCELLED,
      // The reason goes last, after " Reason: ", so the inbox shows it on its
      // own line (splitReason).
      message: `You cancelled "${event.name ?? 'your event'}".${released}${closed} Reason: ${reason}`,
      relatedEventId: event.id,
    });
  }
}

/** "1 venue booking", "2 venue bookings". */
function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
