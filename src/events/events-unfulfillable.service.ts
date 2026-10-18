import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { EventStatus, NotificationType } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { BookingsService } from '../bookings/bookings.service';
import { EquipmentReservationsService } from '../equipment/equipment-reservations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  RejectUnfulfillableDto,
  UNFULFILLABLE_REASON_LABELS,
} from './dto/reject-unfulfillable.dto';
import { UNFULFILLABLE_REJECTION_STATUSES } from './event-status.machine';
import { EventsService } from './events.service';

/** US-47 — what a rejection as unfulfillable did. */
export interface UnfulfillableRejection {
  eventId: string;
  status: EventStatus;
  decisionReason: string;
  releasedVenueBookings: number;
  releasedEquipmentReservations: number;
}

/** "No suitable venue: <comment>" — the text stored and shown to the Organiser. */
export function unfulfillableReasonText(dto: RejectUnfulfillableDto): string {
  return `${UNFULFILLABLE_REASON_LABELS[dto.reason]}: ${dto.comment}`;
}

/**
 * US-47 — the Coordinator rejects an event request when no suitable venue or
 * equipment can ultimately be found, so it ends with a clear outcome instead
 * of staying pending (customer: an unfulfilled event is rejected).
 *
 * Kept apart from the review rejection (US-08, EventsService.reject): that
 * one decides a request under review; this one ends an approved request that
 * cannot be arranged, and gives back what it held.
 */
@Injectable()
export class EventsUnfulfillableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
    private readonly events: EventsService,
    private readonly bookings: BookingsService,
    private readonly reservations: EquipmentReservationsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * AC-1..AC-6, in one transaction so the event is never rejected while still
   * holding venues or equipment (or the other way round):
   *  - the reason and comment are stored in decisionReason, the field a
   *    rejection's reason has always lived in and the Organiser's view reads;
   *  - the status becomes REJECTED through EventsService.setStatus(), the one
   *    status writer (AC-4);
   *  - its live venue bookings and equipment reservations are released,
   *    records kept (AC-5) — equipment through US-33's release;
   *  - the Organiser is notified once it has committed (AC-6).
   *
   * Nothing else about the event changes.
   */
  async reject(
    user: AuthenticatedUser,
    id: string,
    dto: RejectUnfulfillableDto,
  ): Promise<UnfulfillableRejection> {
    // The responsible Coordinator only, exactly as for a review decision.
    const event = await this.access.assertEventAccess(user, id, Action.REVIEW);
    if (!this.access.isAssignedCoordinator(user, event)) {
      throw new ForbiddenException('only the assigned coordinator may reject this request');
    }

    if (!UNFULFILLABLE_REJECTION_STATUSES.includes(event.status)) {
      throw new ConflictException(
        `an event that is ${event.status} cannot be rejected as unfulfillable`,
      );
    }

    const decisionReason = unfulfillableReasonText(dto);

    const result = await this.prisma.$transaction(async (tx) => {
      const withReason = await tx.eventRequest.update({
        where: { id: event.id },
        data: { decisionReason },
      });

      const rejected = await this.events.setStatus(withReason, EventStatus.REJECTED, tx);

      const releasedVenueBookings = await this.bookings.releaseForEvent(tx, event.id);
      const releasedEquipmentReservations = await this.reservations.releaseForCancelledEvent(
        event.id,
        tx,
      );

      return {
        eventId: rejected.id,
        status: rejected.status,
        decisionReason,
        releasedVenueBookings,
        releasedEquipmentReservations,
      };
    });

    // AC-6: after commit and best-effort (see NotificationsService).
    await this.notifications.notifySafely({
      recipientId: event.organiserId,
      type: NotificationType.EVENT_STATUS_CHANGED,
      message: `Your event request "${event.name ?? 'Untitled event'}" has been rejected because it cannot be fulfilled. Reason: ${decisionReason}`,
      relatedEventId: event.id,
    });

    return result;
  }
}
