import { Injectable } from '@nestjs/common';
import { EventStatus, NotificationType, Prisma } from '@prisma/client';

import { shortSlot } from '../bookings/slot-label';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { inEntryOrder } from '../prisma/readable-id';
import { technicalSupportStaffIds } from './equipment-status-notifier';

/** One reservation line as a notice names it: "2 × Projector". */
export interface ReservationLine {
  quantity: number;
  equipmentType: string;
}

/** A reservation US-48 moved, as rebookForEventChange() reports it. */
export interface MovedReservation extends ReservationLine {
  from: { start: Date; end: Date };
  to: { start: Date; end: Date };
}

const lines = (rows: readonly ReservationLine[]) =>
  rows.map((r) => `${r.quantity} × ${r.equipmentType}`).join(', ');

/**
 * US-66 — Technical Support hear about equipment work for events they are
 * assigned to (US-61), instead of finding it by polling.
 *
 * The Technical Support counterpart of US-40's VenueActivityNotifier: the
 * event's assigned member (EventRequest.technicalSupportId, read inside the
 * caller's transaction) takes the place of the venue's manager, and an event
 * with nobody assigned tells no one (AC-1/AC-2). The one exception is AC-3: a
 * new or changed equipment request reaches the whole pool while nobody is
 * assigned, since that is what an assignment is made from.
 *
 * AC-1/AC-2 record through NotificationsService.notify(input, tx), like the
 * venue notices they mirror, so the notice exists if and only if the release
 * or rebook committed. AC-3 is sent after its save commits, best-effort.
 */
@Injectable()
export class TechnicalSupportNotifier {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * AC-1 — the event was cancelled (US-43) or rejected as unfulfillable
   * (US-47), and these live reservations were released (US-32). Mirrors
   * US-40's BOOKING_EVENT_CANCELLED; nothing is sent when nothing was held.
   */
  async reservationsReleased(
    tx: Prisma.TransactionClient,
    eventId: string,
    released: readonly ReservationLine[],
  ): Promise<void> {
    if (released.length === 0) return;

    const event = await tx.eventRequest.findUniqueOrThrow({
      where: { id: eventId },
      select: { status: true, technicalSupportId: true },
    });
    if (!event.technicalSupportId) return;

    const what =
      event.status === EventStatus.REJECTED ? 'Event rejected as unfulfillable' : 'Event cancelled';

    await this.notifications.notify(
      {
        recipientId: event.technicalSupportId,
        type: NotificationType.EQUIPMENT_EVENT_CANCELLED,
        message: `${what}. Released: ${lines(released)}.`,
        relatedEventId: eventId,
      },
      tx,
    );
  }

  /**
   * AC-2 — an approved change request (US-48) rebooked the event's
   * reservations for its new time. Mirrors US-40's BOOKING_DETAILS_CHANGED:
   * old and new time, and that the commitment carries over.
   */
  async reservationsRebooked(
    tx: Prisma.TransactionClient,
    eventId: string,
    rebooked: readonly MovedReservation[],
  ): Promise<void> {
    if (rebooked.length === 0) return;

    const event = await tx.eventRequest.findUniqueOrThrow({
      where: { id: eventId },
      select: { technicalSupportId: true },
    });
    if (!event.technicalSupportId) return;

    // Every line moves with the event, so they share one old and one new slot.
    const { from, to } = rebooked[0];

    await this.notifications.notify(
      {
        recipientId: event.technicalSupportId,
        type: NotificationType.EQUIPMENT_RESERVATIONS_REBOOKED,
        message:
          `Time ${shortSlot(from.start, from.end)} → ${shortSlot(to.start, to.end)}. ` +
          `Rebooked: ${lines(rebooked)}. The reservations carry over; nothing needs committing again.`,
        relatedEventId: eventId,
      },
      tx,
    );
  }

  /**
   * AC-3 — the Coordinator recorded or changed the event's equipment and
   * technical requirements (US-27). To the assigned member once there is one;
   * until then to every Technical Support member, since the request comes
   * before anyone is assigned. Returns how many were told.
   */
  async requirementsChanged(eventId: string): Promise<number> {
    const event = await this.prisma.eventRequest.findUnique({
      where: { id: eventId },
      select: {
        technicalSupportId: true,
        technicalSupportNeeds: true,
        equipmentRequirements: { select: { id: true, equipmentType: true, quantity: true } },
      },
    });
    if (!event) return 0;

    const recipients = event.technicalSupportId
      ? [event.technicalSupportId]
      : await technicalSupportStaffIds(this.prisma);

    const equipment = inEntryOrder(event.equipmentRequirements);
    const support = event.technicalSupportNeeds?.trim() || null;
    const parts: string[] = [];
    if (equipment.length > 0) parts.push(`Equipment: ${lines(equipment)}.`);
    if (support) parts.push(`Technical support: ${support}`);
    const message = parts.length > 0 ? parts.join(' ') : 'All equipment and technical requirements were removed.';

    await Promise.all(
      recipients.map((recipientId) =>
        this.notifications.notifySafely({
          recipientId,
          type: NotificationType.EQUIPMENT_REQUEST_SUBMITTED,
          message,
          relatedEventId: eventId,
        }),
      ),
    );

    return recipients.length;
  }
}
